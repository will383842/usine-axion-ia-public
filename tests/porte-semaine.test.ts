/**
 * POST /api/porte/planification/semaine : accès (404, 401), validation (400 en français), « Tout arrêter » (409, base non lue), proxy ;
 * puis, sur une vraie base (DATABASE_URL), le tirage à la demande : forme lue par le Studio, même réponse pour deux demandes identiques,
 * lecture seule, interrupteurs éteints, les 409 en français, sujets déjà fabriqués ou retenus, lignes fixes, réseau sans compte.
 * Base, Studio et données fictifs : rien de réel.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { estUnLundi, type LigneSemainePorte, type SujetPropose } from "@/contrats";
import { signature } from "@/tirage";
import { instantDeParis } from "@/planification/regles";
import { RYTHMES_DEFAUT } from "@/reglages/modele";
import { QUOTAS_DEFAUT } from "@/reglages/quotas";
import { estPublic } from "@/proxy";

const SECRET = "secret-d-essai-de-la-porte-0123456789";
const LUNDI = "2099-03-02";

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

async function monter(opts: { arrete?: boolean } = {}) {
  vi.resetModules();
  const requete = vi.fn(async () => []);
  const estArrete = vi.fn(async () => opts.arrete ?? false);
  const journaliser = vi.fn();
  const appelerStudio = vi.fn();
  const lireOccupesDuStudio = vi.fn();
  const proposerAuStudio = vi.fn();
  const transaction = vi.fn();
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/arret", () => ({ estArrete, sousArret: vi.fn() }));
  vi.doMock("@/lib/base", () => ({ requete, transaction }));
  vi.doMock("@/donnees", async (original) => ({ ...(await original<object>()), journaliser, interrupteurAllume: vi.fn(async () => false) }));
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

describe("porte · semaine · « Tout arrêter »", () => {
  it("409 `arrete` avec sa phrase, et la base n'est pas lue", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const m = await monter({ arrete: true });
    const r = await m.POST(demande({ debut: LUNDI }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ code: "arrete", erreur: "Tout est arrêté dans l'Usine : aucune semaine n'est proposée. Rallumez depuis « Tout arrêter » dans l'Usine." });
    expect(m.requete).not.toHaveBeenCalled();
    expect(m.journaliser).not.toHaveBeenCalled();
  });
});

const url = process.env.DATABASE_URL;
const SERVICES = ["formation", "audit", "coaching", "integration"];
const FAMILLES = ["scène vécue", "constat partagé", "contre-pied", "énumération", "idée reçue corrigée"];
const METIERS = ["essai.un", "essai.deux", "essai.trois"];
const AVANT = new Date("2099-03-01T10:00:00Z");

type Reponse = { propositions: LigneSemainePorte[]; message?: string };

describe.skipIf(!url)("porte · semaine · sur une vraie base", () => {
  const schema = `essai_${randomBytes(4).toString("hex")}`;
  let p: Pool;
  let requetes: string[] = [];

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    // Une seule connexion : chaque essai tourne dans une transaction annulée à la fin (aucune suppression, rien ne passe d'un essai à l'autre).
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 1 });
    vi.resetModules();
    for (const m of ["@/arret", "@/lib/base", "@/donnees", "@/passerelles/studio", "@/commandes/service", "@/reglages"]) vi.doUnmock(m);
    const { utiliserPool } = await import("@/lib/base");
    utiliserPool(p);
    const { jouerMigrations } = await import("@/lib/migrations");
    await jouerMigrations(p);
    await p.query("INSERT INTO secteur (code, nom) VALUES ('essai', 'Secteur d''essai')");
    for (const [i, s] of SERVICES.entries()) await p.query("INSERT INTO service (code, nom, ordre) VALUES ($1, $1, $2) ON CONFLICT (code) DO NOTHING", [s, i]);
    await p.query("INSERT INTO sujet (code, titre) VALUES ('essai.famille-1', 'Famille d''essai')");
    for (const code of METIERS) {
      await p.query("INSERT INTO metier (code, secteur, nom, allume, etat) VALUES ($1, 'essai', $2, true, 'valide')", [code, `Métier ${code}`]);
      for (const s of SERVICES) {
        await p.query("INSERT INTO douleur (code, cible, services, dite, etat) VALUES ($1, $2, $3, 'Une douleur dite.', 'valide')", [`${code}.d${SERVICES.indexOf(s) + 1}`, code, s]);
        for (const k of [1, 2, 3]) {
          await p.query("INSERT INTO cas_usage (code, cible, service, titre, source, sujet, etat) VALUES ($1, $2, $3, $4, 'https://exemple.example.com/source', $5, 'valide')", [
            `${code}.${s}.c0${k}`, code, s, `Cas ${code} ${s} ${k}`, code === "essai.un" ? "essai.famille-1" : null,
          ]);
        }
      }
    }
    for (const t of ["TPE", "PME", "ETI", "GE"]) await p.query("INSERT INTO taille (code, nom, poids, actif) VALUES ($1, $1, '1', 'oui')", [t]);
    for (const [i, f] of FAMILLES.entries()) await p.query("INSERT INTO accroche (code, famille, types_contenu, modele, etat) VALUES ($1, $2, 'video ; carrousel', 'Un modèle.', 'valide')", [`accroche.essai-${i}`, f]);
    await p.query("INSERT INTO format_video (code, nom, statut, en_lot, etat) VALUES ('tableau-anime', 'Tableau animé', 'actif', 'oui', 'valide')");
    await p.query("INSERT INTO format_autre (code, etat_service, etat) VALUES ('carrousel', 'en_service', 'valide')");
    await p.query("INSERT INTO appel (code, reseaux, cible, type_contenu, type, objectif, dit, etat) VALUES ('fin-if-question', 'instagram ; facebook', 'clients', 'video ; carrousel', 'question', 'QUESTION', 'Et chez vous ?', 'valide')");
    for (const r of ["instagram", "facebook"]) {
      await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom, actif, etat) VALUES ($1, $2, $3, 'page', 'Compte fictif', true, 'valide')", [`${r}:essai`, r, "essai"]);
    }
  });
  afterAll(async () => {
    await p?.end();
    const admin = new Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    await p.query("BEGIN");
  });
  afterEach(async () => {
    await p.query("ROLLBACK");
  });

  const allumer = () => p.query("UPDATE interrupteur SET allume = true WHERE code = 'semaine.carrousels'");
  const ajouterLinkedin = async (typeFin = "video ; carrousel") => {
    await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom, actif, etat) VALUES ('linkedin:essai', 'linkedin', 'essai', 'page', 'Compte fictif', true, 'valide')");
    await p.query("INSERT INTO appel (code, reseaux, cible, type_contenu, type, objectif, etat) VALUES ('fin-li', 'linkedin', 'clients', $1, 'question', 'QUESTION', 'valide')", [typeFin]);
  };
  const carrousels = (r: Reponse, reseau?: string) => r.propositions.filter((l) => l.type === "carrousel" && (!reseau || l.reseau === reseau));
  const videos = (r: Reponse) => r.propositions.filter((l) => l.type === "video").map((l) => ({ cle: l.cle, jour: l.jour, reseau: l.reseau, heure: l.heure, signature: l.sujet?.signature }));
  const semaine = async (maintenant: Date = AVANT, reseaux?: string[]) => {
    const { lireSemaineProposee } = await import("@/planification/lecture");
    return JSON.parse(JSON.stringify(await lireSemaineProposee(LUNDI, reseaux as never, maintenant))) as Reponse;
  };
  const erreurDe = async (maintenant: Date = AVANT) => {
    const { lireSemaineProposee } = await import("@/planification/lecture");
    return lireSemaineProposee(LUNDI, undefined, maintenant).then(
      () => null,
      (e: { statut: number; code: string; message: string }) => ({ statut: e.statut, code: e.code, phrase: e.message }),
    );
  };
  const retenir = async (s: SujetPropose, vise?: { jour: string; reseau: string }) => {
    const { POST } = await import("@/app/api/porte/sujets/retenir/route");
    const r = await POST(
      new Request("http://localhost/api/porte/sujets/retenir", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ signature: s.signature, parts: s.parts, type_contenu: s.type_contenu, reference_studio: "0042-AV-TT", ...vise }),
      }),
    );
    expect(r.status).toBe(200);
  };

  it("1 · semaine vide, un métier allumé, Instagram et Facebook : 12 propositions lues par le Studio, sans compte", async () => {
    const { POST } = await import("@/app/api/porte/planification/semaine/route");
    const r = await POST(demande({ debut: LUNDI }));
    expect(r.status).toBe(200);
    const texte = await r.text();
    const corps = JSON.parse(texte) as Reponse;
    expect(Object.keys(corps)).toEqual(["propositions"]);
    expect(corps.propositions).toHaveLength(12);
    for (const l of corps.propositions) {
      expect(l.jour >= LUNDI && l.jour <= "2099-03-08").toBe(true);
      expect(["09:00", "12:30", "18:00"]).toContain(l.heure);
      expect(l.type).toBe("video");
      expect(l.titre?.length).toBeGreaterThan(0);
      expect(l.cle).toMatch(/^[0-9a-f]{64}$/);
      expect(l.pourquoi).toMatch(/^Métier essai\.\w+ · Un créneau libre qui respecte votre rythme \(6 par semaine\)\.$/);
      expect(l.sujet && l.sujet.signature === signature(l.sujet.parts)).toBe(true);
      expect(l.sujet?.type_contenu).toBe("video");
      expect(l.sujet?.reseaux).toEqual(["instagram", "facebook"]);
      expect(Object.keys(l)).not.toContain("compte");
    }
    expect(new Set(corps.propositions.map((l) => l.cle)).size).toBe(12);
    expect(corps.propositions.filter((l) => l.reseau === "instagram")).toHaveLength(6);
    expect(texte).not.toMatch(/"compte"|instagram:essai|facebook:essai/);
    expect(lireCommeLeStudio(corps)).toHaveLength(12);
  });

  it("2 · deux appels au même instant : la même semaine ; à 8 h et 10 h le même jour : mêmes sujets, aucun créneau passé, aucun perdu", async () => {
    const a = await semaine(AVANT);
    expect(await semaine(AVANT)).toEqual(a);
    const huit = await semaine(instantDeParis(LUNDI, "08:00"));
    const dix = await semaine(instantDeParis(LUNDI, "10:00"));
    expect(huit.propositions).toHaveLength(12);
    expect(dix.propositions).toHaveLength(12);
    expect(dix.propositions.some((l) => l.jour === LUNDI && l.heure! <= "10:00")).toBe(false);
    expect(dix.propositions.map((l) => l.sujet!.signature).sort()).toEqual(huit.propositions.map((l) => l.sujet!.signature).sort());
  });

  it("3 · seules des requêtes SELECT, aucun journal, aucune ligne écrite (aucun appel sortant : la garde du dépôt le vérifie)", async () => {
    const compte = async () => (await p.query("SELECT (SELECT count(*) FROM deja_fabrique) + (SELECT count(*) FROM lot) + (SELECT count(*) FROM lot_ligne) + (SELECT count(*) FROM calendrier_ligne) + (SELECT count(*) FROM commande_studio) + (SELECT count(*) FROM journal) AS n")).rows[0].n;
    const avant = await compte();
    const sauve = p.query.bind(p);
    requetes = [];
    const espion = vi.spyOn(p, "query").mockImplementation(((sql: unknown, ...reste: unknown[]) => {
      requetes.push(typeof sql === "string" ? sql : (sql as { text: string }).text);
      return (sauve as (...a: unknown[]) => unknown)(sql, ...reste);
    }) as never);
    try {
      expect((await semaine()).propositions).toHaveLength(12);
    } finally {
      espion.mockRestore();
    }
    expect(requetes.length).toBeGreaterThan(0);
    for (const sql of requetes) {
      expect(sql, sql).toMatch(/^\s*SELECT\b/);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|pg_advisory)\b/i);
    }
    expect(await compte()).toBe(avant);
  });

  it("4 · tirage, lots, calendrier, planification, métiers éteints : la réponse reste 200", async () => {
    const { interrupteurAllume } = await import("@/donnees");
    for (const code of ["tirage", "lots", "calendrier", "planification", "metiers"]) expect(await interrupteurAllume(code)).toBe(false);
    const { POST } = await import("@/app/api/porte/planification/semaine/route");
    expect((await POST(demande({ debut: LUNDI }))).status).toBe(200);
  });

  it("5 · chaque manque : 409, son code, sa phrase en français", async () => {
    await p.query("UPDATE metier SET allume = false");
    expect(await erreurDe()).toEqual({
      statut: 409,
      code: "aucun_metier_allume",
      phrase: "Aucun métier n'est allumé dans l'Usine : allumez au moins un métier dans « Mes métiers » (si l'écran est éteint : Réglages › Interrupteurs › Écran « Métiers »), puis redemandez la semaine.",
    });
    await p.query("UPDATE metier SET allume = true");

    await p.query("UPDATE compte SET actif = false");
    expect(await erreurDe()).toEqual({
      statut: 409,
      code: "aucun_compte",
      phrase:
        "Aucun compte n'est actif pour ces réseaux. Réglages › Mes comptes : rendez actif un compte Instagram ou Facebook, puis redemandez la semaine.",
    });
    await p.query("UPDATE compte SET actif = true");

    // Un métier allumé mais non validé : le tirage l'ignorerait ; la phrase dit de le valider (même code, même forme).
    await p.query("UPDATE metier SET etat = 'propose'");
    expect(await erreurDe()).toEqual({
      statut: 409,
      code: "aucun_metier_allume",
      phrase: "Un métier est allumé, mais aucun n'est validé : ouvrez sa fiche dans « Mes métiers », lisez-la, touchez « Valider ce métier », puis redemandez la semaine.",
    });
    await p.query("UPDATE metier SET etat = 'valide'");

    const zero = { min: 0, max: 0 };
    await p.query(`INSERT INTO reglage (cle, valeur) VALUES ('rythmes', $1)`, [JSON.stringify({ instagram: zero, facebook: zero })]);
    expect(await erreurDe()).toEqual({ statut: 409, code: "rythme_zero", phrase: "Tous vos réseaux sont au repos (rythme à zéro) : réglez un rythme dans Réglages." });
    await p.query("UPDATE reglage SET valeur = '{}' WHERE cle = 'rythmes'");

    await p.query("UPDATE cas_usage SET etat = 'propose'");
    const sujet = await erreurDe();
    expect(sujet?.statut).toBe(409);
    expect(sujet?.code).toBe("aucun_sujet");
    expect(sujet?.phrase).toBe(
      "L'Usine n'a trouvé aucun sujet neuf pour cette semaine : ceux des métiers allumés sont déjà fabriqués ou retenus, ou il manque des cas d'usage dans les bases. Allumez un autre métier dans « Mes métiers », puis redemandez la semaine.",
    );
    await p.query("UPDATE cas_usage SET etat = 'valide'");

    await p.query("UPDATE format_video SET etat = 'propose'");
    expect(await erreurDe()).toEqual({ statut: 409, code: "aucun_format", phrase: "Aucun format vidéo n'est en service dans les bases." });
    await p.query("UPDATE format_video SET etat = 'valide'");

    const passee = await erreurDe(new Date("2099-03-20T10:00:00Z"));
    expect(passee).toEqual({ statut: 409, code: "semaine_passee", phrase: "Cette semaine est passée : choisissez une semaine à venir." });
    // Par la route : le corps rendu au Studio est { erreur, code }.
    await p.query("UPDATE metier SET allume = false");
    const { POST } = await import("@/app/api/porte/planification/semaine/route");
    const r = await POST(demande({ debut: LUNDI }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "aucun_metier_allume", erreur: expect.stringContaining("Aucun métier n'est allumé") });
  });

  it("5 bis · semaine déjà pleine selon les rythmes : 409 semaine_pleine", async () => {
    for (const r of ["instagram", "facebook"]) {
      for (let i = 0; i < 6; i++) {
        await p.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le, date_choisie) VALUES ($1, $2, 'video', $3, true)`, [r, `${r}:essai`, instantDeParis(`2099-03-0${2 + i}`, "12:30")]);
      }
    }
    expect(await erreurDe()).toEqual({ statut: 409, code: "semaine_pleine", phrase: "La semaine est déjà pleine selon vos rythmes : rien de plus à proposer." });
  });

  it("6 · un sujet déjà fabriqué n'est jamais proposé", async () => {
    const a = await semaine();
    const vus = a.propositions.slice(0, 5).map((l) => l.sujet!);
    for (const s of vus) await retenir(s);
    const b = await semaine();
    const interdites = new Set(vus.map((s) => s.signature));
    expect(b.propositions.length).toBeGreaterThan(0);
    for (const l of b.propositions) expect(interdites.has(l.sujet!.signature)).toBe(false);
  });

  it("7 · deux lignes fixes Instagram : seulement quatre créneaux Instagram tirés", async () => {
    for (const j of ["02", "04"]) {
      await p.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le, date_choisie) VALUES ('instagram', 'instagram:essai', 'video', $1, true)`, [instantDeParis(`2099-03-${j}`, "12:30")]);
    }
    const r = await semaine();
    expect(r.propositions.filter((l) => l.reseau === "instagram")).toHaveLength(4);
    expect(r.propositions.filter((l) => l.reseau === "facebook")).toHaveLength(6);
    // Les créneaux pris par les lignes fixes ne sont pas reproposés.
    expect(r.propositions.some((l) => l.reseau === "instagram" && (l.jour === "2099-03-02" || l.jour === "2099-03-04") && l.heure === "12:30")).toBe(false);
  });

  it("8 · un sujet retenu avec jour et réseau de la semaine : son créneau disparaît, les autres gardent clé et sujet", async () => {
    const a = await semaine();
    const choisie = a.propositions[3];
    await retenir(choisie.sujet!, { jour: choisie.jour, reseau: choisie.reseau });
    const b = await semaine();
    expect(b.propositions).toHaveLength(11);
    expect(b.propositions.some((l) => l.cle === choisie.cle)).toBe(false);
    expect(b.propositions).toEqual(a.propositions.filter((l) => l.cle !== choisie.cle));
    // Sans jour ni réseau, un sujet retenu n'est pas un créneau pris : seul le sujet est écarté.
  });

  it("9 · un réseau sans compte actif : ses créneaux sont absents, et `message` le dit", async () => {
    await p.query("UPDATE compte SET actif = false WHERE reseau = 'facebook'");
    const r = await semaine();
    expect(r.propositions.every((l) => l.reseau === "instagram")).toBe(true);
    expect(r.propositions).toHaveLength(6);
    expect(r.message).toBe("Facebook n'est pas proposé : aucun compte actif.");
    expect(lireCommeLeStudio(r)).toHaveLength(6);
  });

  it("`ressemble_a` : le titre du dernier contenu déjà fabriqué de la même famille, avec sa date ; absent sinon", async () => {
    await p.query(`INSERT INTO deja_fabrique (type_contenu, metier, service, cas_usage, format, structure, signature, fabrique_le) VALUES ('video', 'essai.un', 'audit', 'essai.un.audit.c01', 'tableau-anime', 'scène vécue', 'sig-ancienne-1', '2099-02-12T10:00:00Z')`);
    const r = await semaine();
    const deLaFamille = r.propositions.filter((l) => l.sujet?.sujet?.code === "essai.famille-1");
    expect(deLaFamille.length).toBeGreaterThan(0);
    for (const l of deLaFamille) expect(l.ressemble_a).toBe("« Cas essai.un audit 1 », fabriqué le 12/02");
    for (const l of r.propositions.filter((x) => !x.sujet?.sujet)) expect(l.ressemble_a).toBeUndefined();
  });

  it("des lignes déjà au calendrier restent proposées comme avant : clé de la ligne, aucun sujet", async () => {
    const l = await p.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le) VALUES ('instagram', 'instagram:essai', 'video', $1) RETURNING id::text`, [instantDeParis("2099-03-05", "09:00")]);
    const r = await semaine();
    const { cleSemaine } = await import("@/planification/lecture");
    const reprise = r.propositions.find((x) => x.cle === cleSemaine(LUNDI, l.rows[0].id));
    expect(reprise).toBeDefined();
    expect(reprise?.sujet).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/"compte"/);
  });

  const titres = (r: Reponse) => r.propositions.map((l) => l.titre);

  it("R1 · un même cas d'usage (même titre) n'apparaît qu'une fois dans la semaine, tous réseaux confondus", async () => {
    await p.query("UPDATE metier SET allume = false WHERE code <> 'essai.un'");
    const r = await semaine();
    expect(r.propositions).toHaveLength(12);
    expect(new Set(titres(r)).size).toBe(12);
    for (const l of r.propositions) expect(l.pourquoi).not.toContain("revient déjà");
  });

  it("R1 bis · pas assez de cas différents : les cas reviennent, et le champ pourquoi le dit", async () => {
    await p.query("UPDATE metier SET allume = false WHERE code <> 'essai.un'");
    await p.query("UPDATE cas_usage SET etat = 'propose' WHERE code NOT IN ('essai.un.audit.c01', 'essai.un.audit.c02', 'essai.un.audit.c03')");
    const r = await semaine();
    expect(r.propositions.length).toBeGreaterThan(3);
    expect(new Set(titres(r)).size).toBe(3);
    const repetes = r.propositions.filter((l) => l.pourquoi!.includes("Ce cas d'usage revient déjà dans la semaine"));
    expect(repetes).toHaveLength(r.propositions.length - 3);
  });

  it("R2 · un sujet retenu le lundi pour mercredi Instagram, demande du mardi : seule sa place disparaît", async () => {
    const mardi = instantDeParis("2099-03-03", "08:00");
    const sans = await semaine(mardi);
    const lundi = await semaine(instantDeParis(LUNDI, "08:00"));
    const choisie = lundi.propositions.find((l) => l.reseau === "instagram" && l.jour === "2099-03-04")!;
    expect(choisie).toBeDefined();
    await retenir(choisie.sujet!, { jour: choisie.jour, reseau: choisie.reseau });
    const avec = await semaine(mardi);
    expect(avec.propositions).toHaveLength(sans.propositions.length - 1);
    expect(avec.propositions.some((l) => l.sujet!.signature === choisie.sujet!.signature)).toBe(false);
    expect(avec.propositions.some((l) => l.reseau === "instagram" && l.jour === "2099-03-04")).toBe(sans.propositions.filter((l) => l.reseau === "instagram" && l.jour === "2099-03-04").length > 1);
  });

  it("R3 · la grille Instagram est répartie : au plus une publication par jour avec 6 par semaine", async () => {
    const r = await semaine();
    const jours = r.propositions.filter((l) => l.reseau === "instagram").map((l) => l.jour);
    expect(jours).toHaveLength(6);
    expect(new Set(jours).size).toBe(6);
  });

  it("R4 · semaine en cours : jamais de créneau passé, et celui du jour est reporté à une heure libre", async () => {
    const jeudi = "2099-03-05";
    const tot = await semaine(instantDeParis(jeudi, "08:00"));
    const tard = await semaine(instantDeParis(jeudi, "10:00"));
    expect(tot.propositions.filter((l) => l.jour === jeudi && l.heure === "09:00").length).toBeGreaterThan(0);
    expect(tard.propositions.some((l) => l.jour === jeudi && l.heure! <= "10:00")).toBe(false);
    expect(tard.propositions).toHaveLength(tot.propositions.length);
    expect(tard.propositions.filter((l) => l.jour === jeudi).every((l) => l.heure === "12:30" || l.heure === "18:00")).toBe(true);
  });

  it("R5 · sans `reseaux`, une ligne déplaçable d'un autre réseau (TikTok) n'est pas proposée", async () => {
    await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom, actif, etat) VALUES ('tiktok:essai', 'tiktok', 'essai', 'page', 'Compte fictif', true, 'valide')");
    await p.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le) VALUES ('tiktok', 'tiktok:essai', 'video', $1)`, [instantDeParis("2099-03-05", "09:00")]);
    const r = await semaine();
    expect(r.propositions.some((l) => l.reseau === "tiktok")).toBe(false);
    expect(r.propositions).toHaveLength(12);
  });

  it("R6 · phrases en français simple : fin manquante, YouTube seul, « retenu le »", async () => {
    await p.query("UPDATE appel SET etat = 'propose'");
    const sansFin = await erreurDe();
    expect(sansFin).toEqual({
      statut: 409,
      code: "aucun_sujet",
      phrase: "L'Usine n'a trouvé aucun sujet neuf pour cette semaine : il manque, dans les bases, une phrase de fin pour Instagram, Facebook. Ajoutez-en une aux bases, puis redemandez la semaine.",
    });
    await p.query("UPDATE appel SET etat = 'valide'");

    const { lireSemaineProposee } = await import("@/planification/lecture");
    const yt = await lireSemaineProposee(LUNDI, ["youtube"], AVANT).then(() => null, (e: { statut: number; code: string; message: string }) => ({ statut: e.statut, code: e.code, phrase: e.message }));
    expect(yt).toEqual({ statut: 409, code: "rythme_zero", phrase: "YouTube n'est pas proposé pour l'instant : choisissez Instagram, Facebook, TikTok ou LinkedIn." });

    await p.query(`INSERT INTO deja_fabrique (type_contenu, metier, service, cas_usage, format, structure, signature, fabrique_le, note) VALUES ('video', 'essai.un', 'audit', 'essai.un.audit.c01', 'tableau-anime', 'scène vécue', 'sig-retenue-1', '2099-02-12T10:00:00Z', 'Retenu au studio : 0042-AV-TT')`);
    const r = await semaine();
    const l = r.propositions.find((x) => x.sujet?.sujet?.code === "essai.famille-1");
    expect(l?.ressemble_a).toBe("« Cas essai.un audit 1 », retenu le 12/02");
  });

  it("R7 · un créneau ne porte jamais un sujet sans fin pour son réseau", async () => {
    await p.query("UPDATE appel SET reseaux = 'facebook'");
    const r = await semaine();
    expect(r.propositions.length).toBeGreaterThan(0);
    for (const l of r.propositions) expect(l.sujet!.fins[l.reseau as "facebook"], `${l.reseau} ${l.jour}`).toBeDefined();
    expect(r.propositions.some((l) => l.reseau === "instagram")).toBe(false);
  });

  describe("carrousels dans la semaine (plan #63)", () => {
    it("C1 · éteint : aucune ligne carrousel, réponse égale à celle d'avant", async () => {
      const a = await semaine();
      expect(carrousels(a)).toHaveLength(0);
      expect(a.propositions).toHaveLength(12);
      expect(a.message).toBeUndefined();
      expect((await p.query("SELECT allume FROM interrupteur WHERE code = 'semaine.carrousels'")).rows).toEqual([{ allume: false }]);
      // Même format, même base, avec ou sans fin carrousel : éteint, la réponse ne change pas.
      await p.query("UPDATE appel SET type_contenu = 'video'");
      expect(await semaine()).toEqual(a);
    });

    it("C2 · allumé : exactement 2 carrousels par réseau (départ), deux jours différents, sujet de type carrousel", async () => {
      await allumer();
      const r = await semaine();
      for (const reseau of ["instagram", "facebook"]) {
        const c = carrousels(r, reseau);
        expect(c).toHaveLength(2);
        expect(new Set(c.map((l) => l.jour)).size).toBe(2);
        for (const l of c) {
          expect(l.sujet?.type_contenu).toBe("carrousel");
          expect(l.sujet?.parts.format).toBe("carrousel");
          expect(l.pourquoi).toMatch(/ · Un carrousel dans la semaine \(2 par semaine\)\.$/);
          expect(Object.keys(l)).not.toContain("compte");
        }
      }
      expect(r.propositions).toHaveLength(16);
      expect(r.message).toBeUndefined();
      expect(new Set(r.propositions.map((l) => l.cle)).size).toBe(16);
      expect(lireCommeLeStudio(r)).toHaveLength(16);
    });

    it("C3 · les vidéos sont identiques, interrupteur éteint ou allumé", async () => {
      const avant = await semaine();
      await allumer();
      const apres = await semaine();
      expect(videos(apres)).toEqual(videos(avant));
      expect(videos(apres)).toHaveLength(12);
    });

    it("C3 bis · semaine en partie posée (deux lignes image sur Facebook et Instagram) : vidéos identiques éteint/allumé, 2 carrousels par réseau", async () => {
      for (const r of ["facebook", "instagram"]) {
        for (const j of ["2099-03-03", "2099-03-05"]) await p.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le) VALUES ($1, $2, 'image', $3)`, [r, `${r}:essai`, instantDeParis(j, "09:00")]);
      }
      const avant = await semaine();
      await allumer();
      const apres = await semaine();
      expect(videos(apres)).toEqual(videos(avant));
      expect(videos(apres).length).toBeLessThan(12);
      expect(apres.propositions.filter((l) => l.type !== "carrousel")).toEqual(avant.propositions);
      expect(carrousels(apres, "facebook")).toHaveLength(2);
      expect(carrousels(apres, "instagram")).toHaveLength(2);
    });

    it("C11 · plafond SEMAINE_CARROUSELS_MAX : jamais plus de 10 carrousels, les vidéos gardent leur place", async () => {
      await allumer();
      const avant = await semaine();
      const q = { periode: "jour", quantite: 1 };
      await p.query("INSERT INTO reglage (cle, valeur) VALUES ('quotas_production', $1) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur", [JSON.stringify({ facebook: { carrousel: q }, instagram: { carrousel: q } })]);
      const r = await semaine();
      expect(carrousels(r)).toHaveLength(10);
      expect(videos(r)).toEqual(videos(avant));
    });

    it("C4 · TikTok avec compte actif : des vidéos, jamais de carrousel ; YouTube reste écarté", async () => {
      await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom, actif, etat) VALUES ('tiktok:essai', 'tiktok', 'essai', 'page', 'Compte fictif', true, 'valide')");
      await p.query("UPDATE appel SET reseaux = 'instagram ; facebook ; tiktok'");
      await allumer();
      const r = await semaine(AVANT, ["instagram", "tiktok"]);
      expect(r.propositions.some((l) => l.reseau === "tiktok" && l.type === "video")).toBe(true);
      expect(carrousels(r, "tiktok")).toHaveLength(0);
      expect(carrousels(r, "instagram")).toHaveLength(2);
      const { lireSemaineProposee } = await import("@/planification/lecture");
      await expect(lireSemaineProposee(LUNDI, ["youtube"] as never, AVANT)).rejects.toMatchObject({ statut: 409, code: "rythme_zero" });
    });

    it("C5 · LinkedIn : 2 carrousels avec une fin carrousel ; sans elle, pas de carrousel LinkedIn, message, vidéos rendues, pas de 409", async () => {
      await ajouterLinkedin();
      await allumer();
      const avec = await semaine(AVANT, ["linkedin"]);
      expect(carrousels(avec, "linkedin")).toHaveLength(2);
      expect(avec.propositions.some((l) => l.type === "video" && l.reseau === "linkedin")).toBe(true);

      await p.query("UPDATE appel SET type_contenu = 'video' WHERE code = 'fin-li'");
      const sans = await semaine(AVANT, ["linkedin"]);
      expect(carrousels(sans)).toHaveLength(0);
      expect(sans.propositions.length).toBeGreaterThan(0);
      expect(sans.message).toContain("Aucun carrousel proposé pour LinkedIn : il manque une phrase de fin pour les carrousels dans les bases.");
    });

    it("C6 · format carrousel pas en service dans la base 5 : vidéos rendues, aucun carrousel, message, pas de 409", async () => {
      await p.query("UPDATE format_autre SET etat = 'propose' WHERE code = 'carrousel'");
      await allumer();
      const r = await semaine();
      expect(carrousels(r)).toHaveLength(0);
      expect(r.propositions).toHaveLength(12);
      expect(r.message).toBe("Aucun carrousel proposé : le format carrousel n'est pas en service dans les bases.");
    });

    it("C7 · quota carrousel Facebook à 0 : aucun carrousel Facebook ; quota par jour 1 : borné à 7", async () => {
      await allumer();
      const quotas = (f: unknown) => p.query("INSERT INTO reglage (cle, valeur) VALUES ('quotas_production', $1) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur", [JSON.stringify({ facebook: { carrousel: f } })]);
      await quotas({ periode: "semaine", quantite: 0 });
      const zero = await semaine();
      expect(carrousels(zero, "facebook")).toHaveLength(0);
      expect(carrousels(zero, "instagram")).toHaveLength(2);
      await quotas({ periode: "jour", quantite: 1 });
      const jour = await semaine();
      expect(carrousels(jour, "facebook")).toHaveLength(7);
    });

    it("C8 · un carrousel retenu retire un créneau carrousel (pas une vidéo) et n'est pas reproposé", async () => {
      await allumer();
      const a = await semaine();
      const choisi = carrousels(a, "instagram")[0];
      await retenir(choisi.sujet!, { jour: choisi.jour, reseau: choisi.reseau });
      const b = await semaine();
      expect(videos(b)).toEqual(videos(a));
      expect(carrousels(b, "instagram")).toHaveLength(1);
      expect(carrousels(b, "facebook")).toHaveLength(2);
      expect(b.propositions.some((l) => l.sujet?.signature === choisi.sujet!.signature)).toBe(false);
    });

    it("C9 · un même cas d'usage n'est pas pris deux fois dans la semaine, vidéos et carrousels confondus", async () => {
      await allumer();
      const r = await semaine();
      const t = r.propositions.map((l) => l.titre);
      expect(t).toHaveLength(16);
      expect(new Set(t).size).toBe(16);
    });

    it("C10 · lecture seule : seulement des SELECT, rien d'écrit", async () => {
      await allumer();
      const sauve = p.query.bind(p);
      requetes = [];
      const espion = vi.spyOn(p, "query").mockImplementation(((sql: unknown, ...reste: unknown[]) => {
        requetes.push(typeof sql === "string" ? sql : (sql as { text: string }).text);
        return (sauve as (...a: unknown[]) => unknown)(sql, ...reste);
      }) as never);
      try {
        expect(carrousels(await semaine())).toHaveLength(4);
      } finally {
        espion.mockRestore();
      }
      for (const sql of requetes) expect(sql, sql).toMatch(/^\s*SELECT\b/);
    });
  });
});

describe("porte · semaine · pièces pures", () => {
  it("la graine ne dépend que du lundi ; minuit de Paris ; créneaux virtuels triés après les vraies lignes", async () => {
    vi.doMock("server-only", () => ({}));
    const { graineDeLaSemaine, minuitParis, lignesVirtuelles, cleTirage } = await import("@/planification/semaine-tirage");
    expect(graineDeLaSemaine(LUNDI)).toBe(graineDeLaSemaine(LUNDI));
    expect(graineDeLaSemaine(LUNDI)).not.toBe(graineDeLaSemaine("2099-03-09"));
    expect(graineDeLaSemaine(LUNDI)).toBeGreaterThanOrEqual(0);
    expect(graineDeLaSemaine(LUNDI)).toBeLessThanOrEqual(2 ** 31 - 1);
    expect(minuitParis(new Date("2099-03-04T17:45:00Z")).toISOString()).toBe("2099-03-03T23:00:00.000Z");
    expect(minuitParis(new Date("2099-07-04T21:30:00Z")).toISOString()).toBe("2099-07-03T22:00:00.000Z");
    const v = lignesVirtuelles(["instagram", "tiktok", "facebook"], { ...RYTHMES_DEFAUT, instagram: { min: 2, max: 2 }, facebook: { min: 1, max: 1 } }, { instagram: "instagram:essai", facebook: "facebook:essai" });
    expect(v.map((l) => l.id)).toEqual(["v-instagram-01", "v-instagram-02", "v-facebook-01"]);
    expect(v.every((l) => l.type_contenu === "video" && !l.fixe)).toBe(true);
    expect(["12", "7"].every((id) => id.localeCompare("v-instagram-01", "en", { numeric: true }) < 0)).toBe(true);
    expect(cleTirage(LUNDI, "instagram", "sig")).toMatch(/^[0-9a-f]{64}$/);
    expect(cleTirage(LUNDI, "instagram", "sig")).not.toBe(cleTirage(LUNDI, "facebook", "sig"));
  });

  it("carrousels · lignesVirtuelles : vidéos puis carrousels (ids), type juste ; carrouselsParReseau : TikTok à 0, quota par jour borné à 7", async () => {
    vi.doMock("server-only", () => ({}));
    const { lignesVirtuelles, carrouselsParReseau } = await import("@/planification/semaine-tirage");
    const rythmes = { ...RYTHMES_DEFAUT, instagram: { min: 2, max: 2 }, tiktok: { min: 1, max: 1 } };
    const v = lignesVirtuelles(["instagram", "tiktok"], rythmes, { instagram: "instagram:essai", tiktok: "tiktok:essai" }, { instagram: 2, tiktok: 0 });
    expect(v.map((l) => l.id)).toEqual(["v-instagram-01", "v-instagram-02", "v-instagram-c01", "v-instagram-c02", "v-tiktok-01"]);
    expect(v.map((l) => l.type_contenu)).toEqual(["video", "video", "carrousel", "carrousel", "video"]);
    expect(["v-instagram-02", "v-instagram-09"].every((id) => id.localeCompare("v-instagram-c01", "en", { numeric: true }) < 0)).toBe(true);
    const q = JSON.parse(JSON.stringify(QUOTAS_DEFAUT));
    q.facebook.carrousel = { periode: "jour", quantite: 1 };
    q.linkedin.carrousel = { periode: "semaine", quantite: 0 };
    expect(carrouselsParReseau(["instagram", "tiktok", "facebook", "linkedin"], q)).toEqual({ instagram: 2, tiktok: 0, facebook: 7, linkedin: 0 });
  });
});
