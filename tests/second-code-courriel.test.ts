/**
 * SCC-2 · second code par courriel, côté base (aucun réseau : la passerelle est remplacée par un double).
 * Code haché jamais en clair ; expiration 10 min ; 3 faux = archivé et compteur du compte ; renvoi 60 s / 5 par heure / 10 par 24 h ;
 * code d'une autre session refusé ; un seul code actif ; message identique pour les refus ; journal sans adresse ni code ;
 * suspendre_code_courriel refusée au rôle de l'application et rejouable. Exige DATABASE_URL (sinon sautés).
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";

const envois: { destinataire: string; objet: string; texte: string }[] = [];
let reponse = { envoye: true, statut: 202 };
vi.mock("@/passerelles/courriel", () => ({
  courrielConfigure: () => true,
  envoyerCourriel: async (destinataire: string, objet: string, texte: string) => {
    envois.push({ destinataire, objet, texte });
    return reponse;
  },
}));

const c = await import("@/auth/courriel");

const url = process.env.DATABASE_URL;
const ADRESSE = "destinataire-essai@example.com";
let p: Pool;
let n = 0;
const dernierCode = () => envois[envois.length - 1].texte.match(/\b(\d{8})\b/)![1];
const jti = () => `jti-${++n}`;
/** Vieillit les codes déjà émis (sans toucher au reste) pour passer les limites de temps. */
const vieillir = (interval: string) => p.query(`UPDATE second_code_courriel SET cree_le = cree_le - $1::interval, expire_le = expire_le - $1::interval`, [interval]);
const reinitCompteur = () => p.query(`UPDATE second_code_essais SET echecs = 0, attente_jusqu_a = NULL, attentes_de_suite = 0 WHERE id = 1`);

describe.skipIf(!url)("second code par courriel", () => {
  beforeAll(async () => {
    const schema = `essai_${randomBytes(4).toString("hex")}`;
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    process.env.SESSION_SECRET = "s".repeat(48);
    process.env.USINE_COURRIEL_SECOND_CODE = ADRESSE;
  });
  beforeEach(async () => {
    envois.length = 0;
    reponse = { envoye: true, statut: 202 };
    await p.query(`UPDATE second_code_courriel SET archive_le = coalesce(archive_le, now()), cree_le = now() - interval '2 days'`);
    await p.query(`UPDATE interrupteur SET allume = true WHERE code = 'connexion.second-code-courriel'`);
    await reinitCompteur();
  });
  afterAll(async () => {
    delete process.env.USINE_COURRIEL_SECOND_CODE;
    await p.end();
  });

  it("migration : interrupteur éteint à la base neuve, tables posées", async () => {
    expect((await p.query(`SELECT 1 FROM migration WHERE nom = '042-second-code-courriel.sql'`)).rowCount).toBe(1);
    expect((await p.query(`SELECT description FROM interrupteur WHERE code = 'connexion.second-code'`)).rows[0].description).not.toContain("viendra");
  });

  it("le code est stocké haché, jamais en clair ; le courriel n'a ni lien ni autre chose que le code", async () => {
    const j = jti();
    expect(await c.emettreCode("connexion", j)).toEqual({ ok: true });
    const code = dernierCode();
    expect(code).toMatch(/^\d{8}$/);
    expect(envois[0]).toMatchObject({ destinataire: ADRESSE, objet: "Votre code Usine Axion" });
    expect(envois[0].texte).not.toMatch(/https?:|www\./);
    const tout = JSON.stringify((await p.query(`SELECT * FROM second_code_courriel`)).rows);
    expect(tout).not.toContain(code);
    expect((await p.query(`SELECT empreinte_code FROM second_code_courriel WHERE archive_le IS NULL`)).rows[0].empreinte_code).toMatch(/^[0-9a-f]{64}$/);
    expect(await c.verifierCode("connexion", code, j)).toEqual({ ok: true });
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code_courriel WHERE utilise_le IS NOT NULL`)).rows[0].n).toBeGreaterThan(0);
    // Un code ne sert qu'une fois.
    expect(await c.verifierCode("connexion", code, j)).toEqual({ ok: false, message: c.MESSAGE_CODE_REFUSE });
  });

  it("expiration à 10 minutes", async () => {
    const j = jti();
    await c.emettreCode("connexion", j);
    const [{ d }] = (await p.query(`SELECT extract(epoch FROM expire_le - cree_le)::int AS d FROM second_code_courriel ORDER BY id DESC LIMIT 1`)).rows;
    expect(d).toBe(600);
    await p.query(`UPDATE second_code_courriel SET expire_le = now() - interval '1 second' WHERE archive_le IS NULL`);
    expect(await c.verifierCode("connexion", dernierCode(), j)).toEqual({ ok: false, message: c.MESSAGE_CODE_REFUSE });
  });

  it("3 faux = code archivé, et le compteur du compte avance", async () => {
    const j = jti();
    await c.emettreCode("connexion", j);
    const bon = dernierCode();
    const faux = bon === "00000000" ? "11111111" : "00000000";
    for (let i = 0; i < 3; i++) expect(await c.verifierCode("connexion", faux, j)).toEqual({ ok: false, message: c.MESSAGE_CODE_REFUSE });
    expect((await p.query(`SELECT essais, archive_le FROM second_code_courriel ORDER BY id DESC LIMIT 1`)).rows[0]).toMatchObject({ essais: 3, archive_le: expect.any(Date) });
    expect((await p.query(`SELECT echecs FROM second_code_essais WHERE id = 1`)).rows[0].echecs).toBe(3);
    // Même le bon code ne sert plus : il faut en demander un autre.
    expect(await c.verifierCode("connexion", bon, j)).toEqual({ ok: false, message: c.MESSAGE_CODE_REFUSE });
  });

  it("renvoi refusé avant 60 s, plafonds par heure et par 24 h ; un seul code actif", async () => {
    const j = jti();
    expect(await c.emettreCode("connexion", j)).toEqual({ ok: true });
    const premier = dernierCode();
    expect(await c.emettreCode("connexion", j)).toEqual({ ok: false, message: c.MESSAGE_TROP_DE_CODES });
    await vieillir("61 seconds");
    expect(await c.emettreCode("connexion", j)).toEqual({ ok: true });
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code_courriel WHERE utilise_le IS NULL AND archive_le IS NULL`)).rows[0].n).toBe(1);
    expect(await c.verifierCode("connexion", premier, j)).toMatchObject({ ok: premier === dernierCode() });
    await p.query(`UPDATE second_code_courriel SET archive_le = coalesce(archive_le, now()), cree_le = now() - interval '2 days'`);
    // 5 envois dans l'heure, puis refus.
    for (let i = 0; i < 5; i++) {
      expect(await c.emettreCode("connexion", j)).toEqual({ ok: true });
      await vieillir("61 seconds");
    }
    expect(await c.emettreCode("connexion", j)).toEqual({ ok: false, message: c.MESSAGE_TROP_DE_CODES });
    // 10 par 24 h : 5 de plus, vieillis hors de l'heure.
    await vieillir("2 hours");
    for (let i = 0; i < 5; i++) {
      expect(await c.emettreCode("connexion", j)).toEqual({ ok: true });
      await vieillir("61 seconds");
    }
    await vieillir("2 hours");
    expect(await c.emettreCode("connexion", j)).toEqual({ ok: false, message: c.MESSAGE_TROP_DE_CODES });
  });

  it("le code d'une autre session est refusé, avec le même message que tous les autres refus", async () => {
    const a = jti();
    await c.emettreCode("connexion", a);
    const code = dernierCode();
    const refus = { ok: false, message: c.MESSAGE_CODE_REFUSE };
    expect(await c.verifierCode("connexion", code, jti())).toEqual(refus); // autre session
    expect(await c.verifierCode("mise_en_service", code, a)).toEqual(refus); // autre but
    expect(await c.verifierCode("connexion", "abc", a)).toEqual(refus); // mal formé
    expect(await c.verifierCode("connexion", code, a)).toEqual({ ok: true });
  });

  it("l'envoi qui échoue : message sans détail, code archivé, journal avec phrase fixe ; éteint : rien ne part", async () => {
    reponse = { envoye: false, statut: 503 };
    expect(await c.emettreCode("connexion", jti())).toEqual({ ok: false, message: c.MESSAGE_ENVOI_IMPOSSIBLE });
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code_courriel WHERE utilise_le IS NULL AND archive_le IS NULL`)).rows[0].n).toBe(0);
    expect((await p.query(`SELECT 1 FROM journal WHERE message = 'Envoi du code impossible (statut 503).'`)).rowCount).toBe(1);
    await p.query(`UPDATE interrupteur SET allume = false WHERE code = 'connexion.second-code-courriel'`);
    envois.length = 0;
    await vieillir("2 days");
    expect((await c.emettreCode("connexion", jti())).ok).toBe(false);
    expect(envois).toHaveLength(0);
    // La mise en service peut envoyer interrupteur éteint.
    reponse = { envoye: true, statut: 202 };
    expect(await c.emettreCode("mise_en_service", jti())).toEqual({ ok: true });
  });

  it("mise en service : une transaction (service confirmé, interrupteur allumé, journal) ; refusée si l'application est allumée", async () => {
    await p.query(`UPDATE interrupteur SET allume = false WHERE code = 'connexion.second-code-courriel'`);
    const j = jti();
    await c.emettreCode("mise_en_service", j);
    await p.query(`UPDATE interrupteur SET allume = true WHERE code = 'connexion.second-code'`);
    expect((await c.mettreEnService(dernierCode(), j)).ok).toBe(false);
    await p.query(`UPDATE interrupteur SET allume = false WHERE code = 'connexion.second-code'`);
    const r = await c.mettreEnService(dernierCode(), j);
    expect(r).toMatchObject({ ok: true, id: expect.any(String) });
    expect((await p.query(`SELECT allume FROM interrupteur WHERE code = 'connexion.second-code-courriel'`)).rows[0].allume).toBe(true);
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code_courriel_service WHERE archive_le IS NULL AND confirme_le IS NOT NULL`)).rows[0].n).toBe(1);
    // Une nouvelle mise en service archive la précédente.
    await vieillir("2 days");
    await c.emettreCode("mise_en_service", j);
    const r2 = await c.mettreEnService(dernierCode(), j);
    expect(r2.ok && r2.id !== (r as { id: string }).id).toBe(true);
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code_courriel_service WHERE archive_le IS NULL`)).rows[0].n).toBe(1);
  });

  it("le journal ne contient ni l'adresse ni aucun code", async () => {
    const journal = JSON.stringify((await p.query(`SELECT * FROM journal`)).rows);
    expect(journal).not.toContain("example.com");
    expect(journal).not.toMatch(/\b\d{8}\b/);
  });

  it("suspendre_code_courriel : refusée au rôle de l'application, réservée à usine_remise, rejouable", async () => {
    await expect(p.query("SELECT suspendre_code_courriel('', 'session du PC', 's')")).rejects.toThrow();
    await expect(p.query("SELECT suspendre_code_courriel('Will', 'message reçu', 's')")).rejects.toThrow();
    await expect(p.query("SELECT suspendre_code_courriel('Will', 'session du PC', '')")).rejects.toThrow();
    const fn = "suspendre_code_courriel(text,text,text)";
    const { rows } = await p.query(
      `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS qui
         FROM pg_proc f, aclexplode(f.proacl) a WHERE f.oid = $1::regprocedure AND a.privilege_type = 'EXECUTE'`,
      [fn],
    );
    expect(rows).toEqual([{ qui: "usine_remise" }]);
    const schema = (await p.query("SELECT current_schema() AS s")).rows[0].s;
    const cl = await p.connect();
    try {
      await cl.query("BEGIN");
      await cl.query("CREATE ROLE usine_essai_courriel NOLOGIN");
      await cl.query(`GRANT USAGE ON SCHEMA ${schema} TO usine_essai_courriel, usine_remise`);
      await cl.query("SET LOCAL ROLE usine_remise");
      expect((await cl.query("SELECT suspendre_code_courriel('Will', 'session du PC', 'essai du rôle') AS id")).rows[0].id).toEqual(expect.any(String));
      await cl.query("RESET ROLE");
      await cl.query(`ALTER FUNCTION ${fn} OWNER TO usine_essai_courriel`);
      await cl.query("SET LOCAL ROLE usine_essai_courriel");
      await expect(cl.query("SELECT suspendre_code_courriel('Will', 'session du PC', 'essai')")).rejects.toMatchObject({ code: "42501" });
    } finally {
      await cl.query("ROLLBACK");
      cl.release();
    }
    // Effets, et rejeu sans dégât.
    await c.emettreCode("mise_en_service", jti());
    await p.query("SELECT suspendre_code_courriel('Will', 'de vive voix', 'session 1')");
    await p.query("SELECT suspendre_code_courriel('Will', 'de vive voix', 'session 1')");
    expect((await p.query(`SELECT allume FROM interrupteur WHERE code = 'connexion.second-code-courriel'`)).rows[0].allume).toBe(false);
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code_courriel_service WHERE archive_le IS NULL`)).rows[0].n).toBe(0);
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code_courriel WHERE utilise_le IS NULL AND archive_le IS NULL`)).rows[0].n).toBe(0);
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code_courriel_suspension`)).rows[0].n).toBeGreaterThanOrEqual(2);
  });
});
