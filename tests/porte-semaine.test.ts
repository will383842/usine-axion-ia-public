/**
 * U-PORTE-SEMAINE · POST /api/porte/planification/semaine : accès (404, 401), validation (400 en français), forme lisible par le Studio,
 * lecture seule (aucune écriture, aucun envoi, aucun appel sortant), arrêt respecté, proxy. Base et Studio fictifs, données fictives.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
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

/** Copie de la lecture du Studio (`lireSemaineUsine`, src/services/usine-porte.ts du Studio) : la réponse doit y passer telle quelle. */
function lireCommeLeStudio(corps: unknown) {
  const lignes = corps && typeof corps === "object" ? (corps as { propositions?: unknown }).propositions : undefined;
  if (!Array.isArray(lignes)) return [];
  const txt = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  return lignes.flatMap((l) => {
    if (!l || typeof l !== "object") return [];
    const o = l as Record<string, unknown>;
    const cle = txt(o.cle, 120);
    if (!cle || typeof o.jour !== "string" || typeof o.reseau !== "string" || typeof o.type !== "string") return [];
    return [{ cle, jour: o.jour, reseau: o.reseau, type: o.type, heure: txt(o.heure, 5), pourquoi: txt(o.pourquoi) }];
  });
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
    // Même demande, même réponse (clés stables, aucun hasard, rien n'a bougé).
    expect(await (await m.POST(demande({ debut: LUNDI }))).json()).toEqual(corps);
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
