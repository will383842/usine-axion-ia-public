/**
 * N-26 · Code par téléphone à la connexion (second code). Une exigence de la fiche par essai :
 * - après le mot de passe, la session n'est que partielle : aucune page, aucune action serveur, aucune route /api ;
 * - l'enregistrement du second code est imposé ; le secret n'est montré qu'une fois ; il est chiffré en base ;
 * - code à usage unique (application d'authentification, RFC 6238) ;
 * - codes de secours montrés une fois, gardés hachés, chacun une seule fois, puis nouveau téléphone imposé ;
 * - remise à zéro par une session ayant accès au serveur, notée (qui, quand, par quelle session) ;
 * - 5 essais faux = attente ; rien du code dans le journal.
 * Les essais de base exigent DATABASE_URL (sinon sautés).
 */
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dechiffrer, chiffrer, empreinte } from "@/auth/chiffrement";
import { codeAuPas, lienApplication, pasDe, trouverPas } from "@/auth/totp";
import { utiliserPool } from "@/lib/base";
import { NOM_COOKIE_SESSION, signerJeton, verifierJeton } from "@/lib/jeton-session";
import { jouerMigrations } from "@/lib/migrations";
import { REGLAGES_ARGON2 } from "@/lib/mot-de-passe";
import { proxy } from "@/proxy";

const bocal = new Map<string, string>();
let ip = "198.51.100.1";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (bocal.has(nom) ? { name: nom, value: bocal.get(nom) } : undefined),
    set: (nom: string, valeur: string) => bocal.set(nom, valeur),
  }),
  headers: async () => new Headers({ "x-real-ip": ip }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const auth = await import("@/services/auth");
const { allumerEcran } = await import("@/components/gabarit/actions");

// RFC 6238, annexe B : secret ASCII « 12345678901234567890 » (SHA-1), en base32.
const SECRET_RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("code à usage unique (RFC 6238)", () => {
  it("donne les codes des vecteurs de la RFC (6 derniers chiffres)", () => {
    expect(codeAuPas(SECRET_RFC, pasDe(59_000))).toBe("287082");
    expect(codeAuPas(SECRET_RFC, pasDe(1_111_111_109_000))).toBe("081804");
    expect(codeAuPas(SECRET_RFC, pasDe(1_234_567_890_000))).toBe("005924");
    expect(codeAuPas(SECRET_RFC, pasDe(2_000_000_000_000))).toBe("279037");
  });

  it("accepte le pas d'avant et d'après, refuse au-delà, et jamais un pas déjà servi", () => {
    const t = 1_234_567_890_000;
    const p = pasDe(t);
    expect(trouverPas(SECRET_RFC, codeAuPas(SECRET_RFC, p), t, null)).toBe(p);
    expect(trouverPas(SECRET_RFC, codeAuPas(SECRET_RFC, p - 1), t, null)).toBe(p - 1);
    expect(trouverPas(SECRET_RFC, codeAuPas(SECRET_RFC, p + 1), t, null)).toBe(p + 1);
    expect(trouverPas(SECRET_RFC, codeAuPas(SECRET_RFC, p + 3), t, null)).toBeNull();
    expect(trouverPas(SECRET_RFC, codeAuPas(SECRET_RFC, p), t, p)).toBeNull();
    expect(trouverPas(SECRET_RFC, "12a456", t, null)).toBeNull();
  });

  it("le lien pour l'application ne porte que le secret, l'émetteur et les réglages standard", () => {
    const lien = lienApplication(SECRET_RFC);
    expect(lien.startsWith("otpauth://totp/")).toBe(true);
    expect(lien).toContain(`secret=${SECRET_RFC}`);
    expect(lien).toContain("digits=6");
    expect(lien).toContain("period=30");
  });
});

describe("chiffrement du secret", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "s".repeat(48);
  });

  it("chiffre, déchiffre, et refuse une enveloppe modifiée ou une autre clé", () => {
    const e = chiffrer(SECRET_RFC);
    expect(e).not.toContain(SECRET_RFC);
    expect(chiffrer(SECRET_RFC)).not.toBe(e);
    expect(dechiffrer(e)).toBe(SECRET_RFC);
    const abime = e.slice(0, -4) + (e.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => dechiffrer(abime)).toThrow();
    process.env.SESSION_SECRET = "t".repeat(48);
    try {
      expect(() => dechiffrer(e)).toThrow();
    } finally {
      process.env.SESSION_SECRET = "s".repeat(48);
    }
  });

  it("l'empreinte des remises est un HMAC à clé du serveur : une autre clé donne une autre empreinte", () => {
    const e = empreinte("adresse:198.51.100.1");
    expect(e).toMatch(/^[0-9a-f]{16}$/);
    process.env.SESSION_SECRET = "t".repeat(48);
    try {
      expect(empreinte("adresse:198.51.100.1")).not.toBe(e);
    } finally {
      process.env.SESSION_SECRET = "s".repeat(48);
    }
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
const MOT_DE_PASSE = "un mot de passe pour le second code";
let p: Pool;
let n = 0;

const requeteProxy = (chemin: string, jeton?: string) =>
  new NextRequest(`https://usine.example.com${chemin}`, { headers: jeton ? { cookie: `${NOM_COOKIE_SESSION}=${jeton}` } : {} });

function codeFaux(secret: string): string {
  const pas = pasDe(Date.now());
  const justes = new Set([-1, 0, 1, 2].map((d) => codeAuPas(secret, pas + d)));
  let c = 100000;
  while (justes.has(String(c))) c++;
  return String(c);
}

/** Mot de passe accepté : rend la session partielle (cookie du bocal). */
async function motDePasse(): Promise<string> {
  bocal.clear();
  expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
  return bocal.get(NOM_COOKIE_SESSION)!;
}

/** L'horloge avance d'un pas de 30 s : le code suivant est neuf (un code ne sert qu'une fois). */
function codeDe(secret: string): string {
  vi.setSystemTime(Date.now() + 30_000);
  return codeAuPas(secret, pasDe(Date.now()));
}

/** Les secrets déjà tirés passent hors de l'heure en cours (limite de 5 secrets par heure). */
const vieillirSecrets = () => p.query("UPDATE second_code SET cree_le = cree_le - interval '1 hour'");

/** Enregistre un téléphone (session partielle en cours) ; rend le secret et les codes de secours. */
async function enregistrer(): Promise<{ secret: string; secours: string[] }> {
  await vieillirSecrets();
  const debut = await auth.commencerSecondCode();
  if (!debut.ok) throw new Error(debut.message);
  const r = await auth.enregistrerSecondCode(codeDe(debut.secret));
  if (!r.ok) throw new Error(r.message);
  return { secret: debut.secret, secours: r.codesSecours };
}

describe.skipIf(!url)("second code à la connexion", { timeout: 30_000 }, () => {
  let secret = "";
  let secours: string[] = [];
  let sessionComplete = "";

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    process.env.SESSION_SECRET = "s".repeat(48);
    process.env.USINE_PASSWORD_HASH_B64 = Buffer.from(await hash(MOT_DE_PASSE, REGLAGES_ARGON2)).toString("base64");
  });

  beforeEach(() => {
    ip = `198.51.100.${++n}`;
  });

  afterAll(async () => {
    delete process.env.USINE_PASSWORD_HASH_B64;
    vi.useRealTimers();
    await p?.end();
  });

  it("après le mot de passe, la session est partielle : aucune page, aucune route /api, aucune action serveur", async () => {
    const partielle = await motDePasse();
    expect(await verifierJeton(partielle)).not.toBeNull();
    expect(await auth.etatConnexion()).toBe("enregistrer");
    const page = await proxy(requeteProxy("/lots", partielle));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://usine.example.com/connexion?suite=%2Flots");
    expect((await proxy(requeteProxy("/api/autre", partielle))).status).toBe(401);
    expect((await proxy(requeteProxy("/connexion", partielle))).headers.get("x-middleware-next")).toBe("1");
    await expect(auth.exigerSession()).rejects.toThrow();
    await p.query("UPDATE interrupteur SET allume = false WHERE code = 'calendrier'");
    await expect(allumerEcran("calendrier")).rejects.toThrow();
    expect((await p.query("SELECT allume FROM interrupteur WHERE code = 'calendrier'")).rows[0]?.allume ?? false).toBe(false);
  });

  it("un ancien jeton sans second code (émis avant N-26) n'ouvre plus rien", async () => {
    const ancien = await signerJeton({ jti: "avant-n26", rc: true }, 3600);
    expect((await proxy(requeteProxy("/lots", ancien))).status).toBe(307);
  });

  it("un ancien jeton de 30 jours (d'avant N-26) ne vaut ni session partielle ni session complète", async () => {
    bocal.clear();
    bocal.set(NOM_COOKIE_SESSION, await signerJeton({ jti: "avant-n26", rc: true }, 30 * 24 * 3600));
    expect(await auth.etatConnexion()).not.toBe("enregistrer");
    expect((await auth.commencerSecondCode()).ok).toBe(false);
    expect((await auth.enregistrerSecondCode("123456")).ok).toBe(false);
    expect((await auth.entrerSecondCode("123456")).ok).toBe(false);
    await expect(auth.exigerSession()).rejects.toThrow();
    // Même marqué « mot de passe », un jeton qui dure plus que la session partielle est refusé.
    bocal.set(NOM_COOKIE_SESSION, await signerJeton({ jti: "trop-long", rc: true, etape: "mdp" }, 3600));
    expect(await auth.etatConnexion()).not.toBe("enregistrer");
    expect((await auth.commencerSecondCode()).ok).toBe(false);
  });

  it("montre le secret une seule fois : en redemander un en tire un autre et l'ancien ne vaut plus", async () => {
    await motDePasse();
    const premier = await auth.commencerSecondCode();
    const second = await auth.commencerSecondCode();
    if (!premier.ok || !second.ok) throw new Error("secret refusé");
    expect(second.secret).not.toBe(premier.secret);
    expect(second.lien).toContain(second.secret);
    const r = await auth.enregistrerSecondCode(codeAuPas(premier.secret, pasDe(Date.now())));
    expect(r.ok).toBe(false);
  });

  it("garde le secret chiffré en base", async () => {
    await motDePasse();
    const debut = await auth.commencerSecondCode();
    if (!debut.ok) throw new Error(debut.message);
    const lignes = JSON.stringify((await p.query("SELECT * FROM second_code")).rows);
    expect(lignes).not.toContain(debut.secret);
    expect(lignes).not.toContain(debut.secret.toLowerCase());
  });

  it("pas plus de 5 secrets tirés par heure", async () => {
    await vieillirSecrets();
    await motDePasse();
    for (let i = 0; i < 5; i++) expect((await auth.commencerSecondCode()).ok).toBe(true);
    expect(await auth.commencerSecondCode()).toEqual({ ok: false, message: "Trop de secrets demandés. Réessayez dans 1 heure." });
    await vieillirSecrets();
    expect((await auth.commencerSecondCode()).ok).toBe(true);
  });

  it("enregistre le téléphone : session complète, codes de secours montrés une fois et gardés hachés", async () => {
    await motDePasse();
    ({ secret, secours } = await enregistrer());
    expect(secours).toHaveLength(10);
    expect(new Set(secours).size).toBe(10);
    sessionComplete = bocal.get(NOM_COOKIE_SESSION)!;
    expect((await proxy(requeteProxy("/lots", sessionComplete))).headers.get("x-middleware-next")).toBe("1");
    expect((await auth.exigerSession()).jti).toEqual(expect.any(String));
    const enBase = JSON.stringify((await p.query("SELECT * FROM second_code_secours")).rows);
    for (const c of secours) {
      expect(enBase).not.toContain(c);
      expect(enBase).not.toContain(c.replace(/-/g, ""));
    }
    expect((await p.query("SELECT count(*)::int AS n FROM second_code_secours WHERE hachage LIKE '$argon2id$%'")).rows[0].n).toBe(10);
    // Une fois enregistré, aucun nouveau secret n'est montré.
    await motDePasse();
    expect(await auth.etatConnexion()).toBe("second-code");
    expect((await auth.commencerSecondCode()).ok).toBe(false);
  });

  it("le code ne sert qu'une fois", async () => {
    await motDePasse();
    const code = codeDe(secret);
    expect(await auth.entrerSecondCode(code)).toEqual({ ok: true });
    expect((await proxy(requeteProxy("/lots", bocal.get(NOM_COOKIE_SESSION)))).headers.get("x-middleware-next")).toBe("1");
    await motDePasse();
    expect((await auth.entrerSecondCode(code)).ok).toBe(false);
    expect((await proxy(requeteProxy("/lots", bocal.get(NOM_COOKIE_SESSION)))).status).toBe(307);
  });

  it("5 essais faux : attente, même avec le bon code ensuite", async () => {
    await motDePasse();
    for (let i = 0; i < 5; i++) expect((await auth.entrerSecondCode(codeFaux(secret))).ok).toBe(false);
    expect(await auth.entrerSecondCode(codeDe(secret))).toEqual({ ok: false, message: "Trop d'essais. Réessayez dans 15 minutes." });
    expect((await auth.entrerCodeSecours(secours[0])).ok).toBe(false);
    // L'attente passée, le bon code est de nouveau accepté.
    await p.query("UPDATE second_code_essais SET attente_jusqu_a = now() - interval '1 second'");
    expect(await auth.entrerSecondCode(codeDe(secret))).toEqual({ ok: true });
  });

  it("l'attente s'allonge sur les paliers de suite (15 min, 1 h, 24 h) ; après 3 attentes de suite, une carte d'alerte", async () => {
    const attenteEnMinutes = async () =>
      Math.round(Number((await p.query("SELECT extract(epoch FROM attente_jusqu_a - now()) AS s FROM second_code_essais")).rows[0].s) / 60);
    const finirAttente = () => p.query("UPDATE second_code_essais SET attente_jusqu_a = now() - interval '1 second'");
    const cinqFaux = async () => {
      for (let i = 0; i < 5; i++) expect((await auth.entrerSecondCode(codeFaux(secret))).ok).toBe(false);
    };
    await motDePasse();
    await cinqFaux();
    expect(await attenteEnMinutes()).toBe(15);
    await finirAttente();
    await cinqFaux();
    expect(await attenteEnMinutes()).toBe(60);
    expect(await auth.entrerSecondCode(codeDe(secret))).toEqual({ ok: false, message: "Trop d'essais. Réessayez dans 1 heure." });
    expect((await p.query("SELECT count(*)::int AS n FROM carte WHERE cle = 'alerte:second-code'")).rows[0].n).toBe(0);
    await finirAttente();
    await cinqFaux();
    expect(await attenteEnMinutes()).toBe(24 * 60);
    expect(await auth.entrerSecondCode(codeDe(secret))).toEqual({ ok: false, message: "Trop d'essais. Réessayez dans 24 heures." });
    const carte = (await p.query("SELECT titre, lien, fait_le, interrupteur FROM carte WHERE cle = 'alerte:second-code'")).rows;
    expect(carte).toEqual([{ titre: expect.stringContaining("3"), lien: "/reglages/mot-de-passe", fait_le: null, interrupteur: null }]);
    expect(JSON.stringify((await p.query("SELECT message FROM journal WHERE sujet = 'connexion'")).rows)).toContain("Alerte");
    // Un succès remet les paliers à zéro : la prochaine attente redevient de 15 minutes.
    await finirAttente();
    expect(await auth.entrerSecondCode(codeDe(secret))).toEqual({ ok: true });
    await motDePasse();
    await cinqFaux();
    expect(await attenteEnMinutes()).toBe(15);
    await finirAttente();
  });

  it("téléphone perdu : un code de secours sert une fois, puis un nouveau téléphone est imposé", async () => {
    const a = await motDePasse();
    expect(await auth.entrerCodeSecours(secours[0].toUpperCase())).toEqual({ ok: true });
    // Le code de secours n'ouvre pas l'Usine : il fait enregistrer un nouveau téléphone.
    expect((await proxy(requeteProxy("/lots", bocal.get(NOM_COOKIE_SESSION)))).status).toBe(307);
    expect(await auth.etatConnexion()).toBe("enregistrer");
    expect((await auth.commencerSecondCode()).ok).toBe(true);
    // L'ancien téléphone et l'ancienne session complète ne valent plus.
    expect((await proxy(requeteProxy("/lots", sessionComplete))).status).toBe(307);
    // Une autre session partielle (mot de passe seul) n'enregistre pas de téléphone : elle n'a pas utilisé le code.
    await motDePasse();
    expect(await auth.etatConnexion()).toBe("second-code");
    expect((await auth.commencerSecondCode()).ok).toBe(false);
    bocal.set(NOM_COOKIE_SESSION, a);
    const debutA = await auth.commencerSecondCode();
    if (!debutA.ok) throw new Error(debutA.message);
    await motDePasse();
    expect((await auth.enregistrerSecondCode(codeDe(debutA.secret))).ok).toBe(false);
    // Le code déjà servi est refusé ; un autre code de secours du même téléphone lie l'enregistrement à cette session.
    expect((await auth.entrerCodeSecours(secours[0])).ok).toBe(false);
    expect(await auth.entrerCodeSecours(secours[1])).toEqual({ ok: true });
    expect(await auth.etatConnexion()).toBe("enregistrer");
    const b = bocal.get(NOM_COOKIE_SESSION)!;
    bocal.set(NOM_COOKIE_SESSION, a);
    expect((await auth.commencerSecondCode()).ok).toBe(false);
    bocal.set(NOM_COOKIE_SESSION, b);
    ({ secret, secours } = await enregistrer());
    const remises = (await p.query("SELECT moyen, demandee_par, session, jeton FROM second_code_remise ORDER BY id")).rows;
    expect(remises.map((r) => [r.moyen, r.demandee_par])).toEqual([
      ["code_de_secours", "Will"],
      ["code_de_secours", "Will"],
    ]);
    // La trace porte des empreintes (HMAC) de l'appareil ou de l'adresse et du jeton, jamais l'adresse ni le jeton en clair.
    for (const r of remises) {
      expect(r.session).toMatch(/^(appareil|adresse):[0-9a-f]{16}$/);
      expect(r.session).not.toContain(ip);
      expect(r.jeton).toMatch(/^[0-9a-f]{16}$/);
    }
    sessionComplete = bocal.get(NOM_COOKIE_SESSION)!;
  });

  it("remise à zéro par le serveur : notée (qui, quand, par quelle session), sessions coupées, nouvel enregistrement imposé", async () => {
    await expect(p.query("SELECT remettre_second_code('', 'session du PC', 'session 92')")).rejects.toThrow();
    await expect(p.query("SELECT remettre_second_code('Will', 'message reçu', 'session 92')")).rejects.toThrow();
    await expect(p.query("SELECT remettre_second_code('Will', 'session du PC', '')")).rejects.toThrow();
    expect((await proxy(requeteProxy("/lots", sessionComplete))).headers.get("x-middleware-next")).toBe("1");
    const avant = await motDePasse();
    await p.query("SELECT remettre_second_code('Will', 'session du PC', 'session 92 sur le PC')");
    // Horloge de l'essai et horloge de la base alignées : la remise a lieu « maintenant » pour l'essai.
    await p.query("UPDATE second_code_remise SET faite_le = to_timestamp($1::double precision) WHERE moyen = 'serveur'", [Date.now() / 1000]);
    // Une session partielle ouverte avant la remise n'enregistre pas de téléphone.
    bocal.set(NOM_COOKIE_SESSION, avant);
    expect(await auth.etatConnexion()).toBe("second-code");
    expect((await auth.commencerSecondCode()).ok).toBe(false);
    vi.setSystemTime(Date.now() + 2_000);
    const { rows } = await p.query("SELECT moyen, demandee_par, demande_faite, session, faite_le FROM second_code_remise WHERE moyen = 'serveur'");
    expect(rows).toEqual([{ moyen: "serveur", demandee_par: "Will", demande_faite: "session du PC", session: "session 92 sur le PC", faite_le: expect.any(Date) }]);
    expect((await proxy(requeteProxy("/lots", sessionComplete))).status).toBe(307);
    await motDePasse();
    expect(await auth.etatConnexion()).toBe("enregistrer");
    expect((await auth.entrerSecondCode(codeDe(secret))).ok).toBe(false);
    ({ secret, secours } = await enregistrer());
  });

  it("remettre_second_code : retirée à PUBLIC et au propriétaire, accordée au seul rôle d'administration usine_remise", async () => {
    const fn = "remettre_second_code(text,text,text)";
    const { rows } = await p.query(
      `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS qui
         FROM pg_proc f, aclexplode(f.proacl) a WHERE f.oid = $1::regprocedure AND a.privilege_type = 'EXECUTE'`,
      [fn],
    );
    expect(rows).toEqual([{ qui: "usine_remise" }]);
    const c = await p.connect();
    try {
      await c.query("BEGIN");
      // Le rôle de l'application, simulé par un rôle sans privilège propriétaire de la fonction : appel refusé.
      await c.query("CREATE ROLE usine_essai_appli NOLOGIN");
      await c.query(`GRANT USAGE ON SCHEMA ${schema} TO usine_essai_appli, usine_remise`);
      await c.query("SET LOCAL ROLE usine_remise");
      // usine_remise n'a aucun droit sur les tables : la fonction (SECURITY DEFINER) fait la remise pour lui.
      expect((await c.query("SELECT remettre_second_code('Will', 'session du PC', 'essai du rôle') AS id")).rows[0].id).toEqual(expect.any(String));
      await c.query("RESET ROLE");
      await c.query(`ALTER FUNCTION ${fn} OWNER TO usine_essai_appli`);
      await c.query("SET LOCAL ROLE usine_essai_appli");
      await expect(c.query("SELECT remettre_second_code('Will', 'session du PC', 'essai')")).rejects.toMatchObject({ code: "42501" });
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });

  it("n'écrit rien du code, du secret ni des codes de secours dans le journal", async () => {
    const journal = JSON.stringify((await p.query("SELECT * FROM journal")).rows);
    expect(journal).toContain("Second code");
    const chiffres = JSON.stringify((await p.query("SELECT secret_chiffre FROM second_code")).rows);
    for (const s of [secret, secret.toLowerCase(), ...secours, ...secours.map((c) => c.replace(/-/g, "")), "$argon2id$", "otpauth"]) expect(journal).not.toContain(s);
    expect(journal).not.toContain(chiffres.slice(30, 60));
    // Aucun code à 6 chiffres du secret en cours autour de maintenant.
    const pas = pasDe(Date.now());
    for (let d = -40; d <= 5; d++) expect(journal).not.toContain(`"${codeAuPas(secret, pas + d)}"`);
  });
});
