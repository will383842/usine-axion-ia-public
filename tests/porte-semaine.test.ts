/**
 * U-PORTE-SEMAINE · POST /api/porte/planification/semaine : accès (404, 401), validation (400 en français), forme lisible par le Studio,
 * lecture seule (aucune écriture, aucun envoi, aucun appel sortant), arrêt respecté, proxy. Base et Studio fictifs, données fictives.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { estUnLundi } from "@/contrats";
import { instantDeParis } from "@/planification/regles";
import { RYTHMES_DEFAUT } from "@/reglages/modele";
import { QUOTAS_DEFAUT } from "@/reglages/quotas";
import { estPublic } from "@/proxy";

const SECRET = "secret-d-essai-de-la-porte-0123456789";
const LUNDI = "2099-03-02";

const ligne = (id: string, s: Record<string, unknown> = {}) => ({
  id,
  reseau: "tiktok",
  compte: "tiktok:compte-fictif-1",
  type_contenu: "video",
  prevue_le: instantDeParis(LUNDI, "09:00"),
  etat: "brouillon",
  date_choisie: false,
  commandee: false,
  deplacable: true,
  ...s,
});

/**
 * Copie fidèle de la lecture complète du Studio : `lireSemaineUsine` (src/services/usine-porte.ts) puis le filtre de `proposerSemaine`
 * (src/services/proposer-semaine.ts) : types affichés, réseaux connus, jours de la semaine demandée, heure valide, clés uniques.
 */
const TYPES_STUDIO = new Set(["video", "carrousel", "infographie", "image"]);
const RESEAUX_STUDIO = new Set(["linkedin", "instagram", "facebook", "tiktok", "youtube", "youtube-shorts"]);
const HEURE_STUDIO = /^([01]\d|2[0-3]):[0-5]\d$/;
const JOUR_STUDIO = /^\d{4}-\d{2}-\d{2}$/;
function lireCommeLeStudio(corps: unknown, debut: string = LUNDI) {
  const lignes = corps && typeof corps === "object" ? (corps as { propositions?: unknown }).propositions : undefined;
  if (!Array.isArray(lignes)) return [];
  const txt = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const lundi = Date.parse(`${debut}T12:00:00Z`);
  const fin = lundi + 7 * 86_400_000;
  const vues = new Set<string>();
  const sortie: { cle: string; jour: string; reseau: string; type: string; heure?: string; pourquoi?: string }[] = [];
  for (const l of lignes) {
    if (!l || typeof l !== "object") continue;
    const o = l as Record<string, unknown>;
    const cle = txt(o.cle, 120);
    if (!cle || typeof o.jour !== "string" || typeof o.reseau !== "string" || typeof o.type !== "string") continue;
    const heure = txt(o.heure, 5);
    const pourquoi = txt(o.pourquoi);
    const t = JOUR_STUDIO.test(o.jour) ? Date.parse(`${o.jour}T12:00:00Z`) : Number.NaN;
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== o.jour) continue;
    if (!(t >= lundi && t < fin) || !RESEAUX_STUDIO.has(o.reseau) || !TYPES_STUDIO.has(o.type) || vues.has(cle)) continue;
    vues.add(cle);
    sortie.push({ cle, jour: o.jour, reseau: o.reseau, type: o.type, ...(heure && HEURE_STUDIO.test(heure) ? { heure } : {}), ...(pourquoi ? { pourquoi } : {}) });
  }
  return sortie;
}

async function monter(opts: { lignes?: Record<string, unknown>[]; arrete?: boolean } = {}) {
  vi.resetModules();
  const requete = vi.fn(async () => opts.lignes ?? []);
  const estArrete = vi.fn(async () => opts.arrete ?? false);
  const journaliser = vi.fn();
  const appelerStudio = vi.fn();
  const lireOccupesDuStudio = vi.fn();
  const proposerAuStudio = vi.fn();
  const transaction = vi.fn();
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/arret", () => ({ estArrete, sousArret: vi.fn() }));
  vi.doMock("@/lib/base", () => ({ requete, transaction }));
  vi.doMock("@/donnees", () => ({ journaliser, interrupteurAllume: vi.fn(async () => false) }));
  vi.doMock("@/passerelles/studio", () => ({ appelerStudio, lireOccupesDuStudio }));
  vi.doMock("@/commandes/service", () => ({ proposerAuStudio, commandesAllumees: vi.fn(async () => true) }));
  vi.doMock("@/reglages", () => ({
    lireReglagesTirage: vi.fn(async () => ({ rythmes: { ...RYTHMES_DEFAUT, tiktok: { min: 1, max: 7 }, instagram: { min: 1, max: 7 } } })),
    lireQuotas: vi.fn(async () => QUOTAS_DEFAUT),
  }));
  const { POST } = await import("@/app/api/porte/planification/semaine/route");
  return { POST, requete, journaliser, appelerStudio, lireOccupesDuStudio, proposerAuStudio, transaction, estArrete };
}

const demande = (corps: unknown, auth: string | null = `Bearer ${SECRET}`) =>
  new Request("http://localhost/api/porte/planification/semaine", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth === null ? {} : { authorization: auth }) },
    body: JSON.stringify(corps),
  });

afterEach(() => {
  delete process.env.USINE_PORTE_SECRET;
  vi.restoreAllMocks();
});

describe("porte · semaine · accès", () => {
  it("porte éteinte (secret absent ou court) : 404 ; sans clé ou clé fausse : 401 ; rien n'est lu en base", async () => {
    const m = await monter();
    expect((await m.POST(demande({ debut: LUNDI }))).status).toBe(404);
    process.env.USINE_PORTE_SECRET = "trop-court";
    expect((await m.POST(demande({ debut: LUNDI }))).status).toBe(404);
    process.env.USINE_PORTE_SECRET = SECRET;
    for (const auth of [null, "Bearer faux", `Bearer ${SECRET}x`, `Basic ${SECRET}`]) {
      const r = await m.POST(demande({ debut: LUNDI }, auth));
      expect(r.status).toBe(401);
      expect(JSON.stringify(await r.json())).not.toContain(SECRET);
    }
    expect(m.requete).not.toHaveBeenCalled();
    expect(m.estArrete).not.toHaveBeenCalled();
  });

  it("le proxy laisse passer cette route, et elle seule autour", () => {
    expect(estPublic("/api/porte/planification/semaine")).toBe(true);
    expect(estPublic("/api/porte/planification/semaine/")).toBe(true);
    for (const p of ["/api/porte/planification", "/api/porte/planification/semaine/x", "/api/porte/planification/semaines", "/api/planification/semaine"]) expect(estPublic(p)).toBe(false);
  });
});

describe("porte · semaine · validation", () => {
  it("rend 400 avec une phrase en français pour un début qui n'est pas un lundi, un réseau inconnu ou un champ en trop", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter();
    const mauvaises: unknown[] = [
      {},
      { debut: "2099-03-03" },
      { debut: "2099-02-30" },
      { debut: "lundi" },
      { debut: 5 },
      { debut: LUNDI, reseaux: [] },
      { debut: LUNDI, reseaux: ["myspace"] },
      { debut: LUNDI, reseaux: "tiktok" },
      { debut: LUNDI, reseaux: ["tiktok", "tiktok", "tiktok", "tiktok", "tiktok", "tiktok", "tiktok"] },
      { debut: LUNDI, reseaux: ["tiktok", "tiktok"] },
      { debut: LUNDI, statut: "valide" },
    ];
    for (const corps of mauvaises) {
      const r = await m.POST(demande(corps));
      expect(r.status, JSON.stringify(corps)).toBe(400);
      const j = (await r.json()) as { erreur: string; code: string };
      expect(j.code).toBe("demande_invalide");
      expect(j.erreur).toMatch(/^Demande invalide\./);
    }
    const r = await m.POST(demande({ debut: "2099-03-03" }));
    expect(((await r.json()) as { erreur: string }).erreur).toContain("Le début doit être un lundi");
    expect(m.requete).not.toHaveBeenCalled();
  });

  it("reconnaît un lundi", () => {
    expect(estUnLundi("2099-03-02")).toBe(true);
    expect(estUnLundi("2026-11-23")).toBe(true);
    expect(estUnLundi("2026-11-24")).toBe(false);
    expect(estUnLundi("2026-13-01")).toBe(false);
  });
});

describe("porte · semaine · réponse", () => {
  it("rend { propositions } lisible par le Studio : clé, jour de la semaine, réseau, type, heure, raison ; rien de plus ; aucune donnée de personne", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter({ lignes: [ligne("1"), ligne("2"), ligne("3", { reseau: "instagram", compte: "instagram:compte-fictif-2" })] });
    const r = await m.POST(demande({ debut: LUNDI }));
    expect(r.status).toBe(200);
    const corps = (await r.json()) as { propositions: Record<string, string>[] };
    expect(Object.keys(corps)).toEqual(["propositions"]);
    expect(corps.propositions).toHaveLength(3);
    for (const p of corps.propositions) {
      expect(Object.keys(p).sort()).toEqual(["cle", "heure", "jour", "pourquoi", "reseau", "type"]);
      expect(p.cle).toMatch(/^[0-9a-f]{64}$/);
      expect(p.jour >= LUNDI && p.jour <= "2099-03-08").toBe(true);
      expect(p.heure).toMatch(/^\d{2}:\d{2}$/);
    }
    expect(new Set(corps.propositions.map((p) => p.cle)).size).toBe(3);
    expect(lireCommeLeStudio(corps)).toHaveLength(3);
    expect(JSON.stringify(corps)).not.toMatch(/compte-fictif|tiktok:|instagram:/);
    // Même demande, même réponse à instant égal (clés stables, aucun hasard, rien n'a bougé) : `maintenant` n'est pas figé ici, mais les lignes sont dans l'avenir.
    expect(await (await m.POST(demande({ debut: LUNDI }))).json()).toEqual(corps);
  });

  it("`texte` et `story` sont rendus par l'Usine (rien n'est filtré) mais le Studio, lui, les écarte : on le constate ici", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter({ lignes: [ligne("1"), ligne("2", { type_contenu: "texte" }), ligne("3", { type_contenu: "story" })] });
    const corps = (await (await m.POST(demande({ debut: LUNDI }))).json()) as { propositions: { type: string }[] };
    expect(corps.propositions.map((p) => p.type).sort()).toEqual(["story", "texte", "video"]);
    expect(lireCommeLeStudio(corps).map((p) => p.type)).toEqual(["video"]);
  });

  it("le filtre de réseaux ne garde que ces réseaux ; semaine vide : liste vide", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter({ lignes: [ligne("1"), ligne("3", { reseau: "instagram" })] });
    const filtre = (await (await m.POST(demande({ debut: LUNDI, reseaux: ["instagram"] }))).json()) as { propositions: { reseau: string }[] };
    expect(filtre.propositions.map((p) => p.reseau)).toEqual(["instagram"]);
    const vide = await monter();
    expect(await (await vide.POST(demande({ debut: LUNDI }))).json()).toEqual({ propositions: [] });
  });

  it("ne bouge pas un jour fixé ni une ligne déjà au Studio : ils ne sont pas reproposés", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter({ lignes: [ligne("1", { date_choisie: true }), ligne("2", { commandee: true }), ligne("3", { deplacable: false })] });
    expect(await (await m.POST(demande({ debut: LUNDI }))).json()).toEqual({ propositions: [] });
  });

  it("« Tout arrêter » : aucune proposition, une phrase, et la base n'est pas lue", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter({ lignes: [ligne("1")], arrete: true });
    const r = await m.POST(demande({ debut: LUNDI }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ propositions: [], arrete: true, message: "Tout est arrêté : rien n'est parti." });
    expect(m.requete).not.toHaveBeenCalled();
  });
});

describe("porte · semaine · lecture seule", () => {
  it("n'écrit rien (que des SELECT), ne journalise pas, ne commande rien, n'appelle pas le Studio (passerelles)", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter({ lignes: [ligne("1"), ligne("2")] });
    expect((await m.POST(demande({ debut: LUNDI }))).status).toBe(200);
    expect(m.requete).toHaveBeenCalled();
    for (const [sql] of m.requete.mock.calls as unknown as [string][]) expect(sql, sql).toMatch(/^\s*SELECT\b/);
    for (const [sql] of m.requete.mock.calls as unknown as [string][]) expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|pg_advisory)/i);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.journaliser).not.toHaveBeenCalled();
    expect(m.proposerAuStudio).not.toHaveBeenCalled();
    expect(m.appelerStudio).not.toHaveBeenCalled();
    expect(m.lireOccupesDuStudio).not.toHaveBeenCalled();
  });

  it("ne dépend pas de l'interrupteur de planification : éteint, la route répond quand même", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter({ lignes: [ligne("1")] }); // interrupteurAllume simulé toujours faux
    expect(((await (await m.POST(demande({ debut: LUNDI }))).json()) as { propositions: unknown[] }).propositions).toHaveLength(1);
  });
});

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("porte · semaine · sur une vraie base", () => {
  const schema = `essai_${randomBytes(4).toString("hex")}`;
  let p: Pool;
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    vi.resetModules();
    for (const m of ["@/arret", "@/lib/base", "@/donnees", "@/passerelles/studio", "@/commandes/service", "@/reglages"]) vi.doUnmock(m);
    const { utiliserPool } = await import("@/lib/base");
    utiliserPool(p);
    const { jouerMigrations } = await import("@/lib/migrations");
    await jouerMigrations(p);
  });
  afterAll(async () => {
    await p?.end();
    const admin = new Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it("calendrier_ligne et commande_studio sont inchangées après l'appel, la réponse est lue par le Studio", async () => {
    const instant = instantDeParis(LUNDI, "09:00");
    await p.query(`INSERT INTO compte (code, reseau, identifiant, nature, nom) VALUES ('tiktok:compte-fictif-1', 'tiktok', 'compte-fictif-1', 'profil', 'Compte fictif')`);
    const l1 = await p.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le) VALUES ('tiktok', 'tiktok:compte-fictif-1', 'video', $1) RETURNING id`, [instant]);
    await p.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le) VALUES ('tiktok', 'tiktok:compte-fictif-1', 'carrousel', $1)`, [instantDeParis(LUNDI, "12:00")]);
    await p.query(
      `INSERT INTO commande_studio (cle, calendrier_ligne, reseau, compte, type_contenu, jour, instant, etat_envoi, etat_studio) VALUES ('cle-essai-1', $1, 'tiktok', 'tiktok:compte-fictif-1', 'video', $2, $3, 'envoyee', 'recue')`,
      [l1.rows[0].id, LUNDI, instant],
    );
    const instantane = async () => ({
      lignes: (await p.query(`SELECT * FROM calendrier_ligne ORDER BY id`)).rows,
      commandes: (await p.query(`SELECT * FROM commande_studio ORDER BY cle`)).rows,
      journal: (await p.query(`SELECT count(*)::int AS n FROM journal`)).rows,
    });
    const avant = await instantane();
    expect(avant.lignes).toHaveLength(2);
    const { lireSemaineProposee } = await import("@/planification/lecture");
    const reponse = await lireSemaineProposee(LUNDI, undefined, new Date("2099-01-01T00:00:00Z"));
    expect(reponse.propositions).toHaveLength(1); // la ligne déjà commandée reste fixe, l'autre est proposée
    expect(lireCommeLeStudio(JSON.parse(JSON.stringify(reponse)))).toHaveLength(1);
    expect(await instantane()).toEqual(avant);
  });
});
