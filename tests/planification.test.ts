/** U-PLANIF · la semaine proposée : tirage sans IA, créneaux pris, rythmes, quotas, anti-répétition, porte. Aucun appel réel. */
import { describe, expect, it, vi } from "vitest";
import { cleCommande } from "@/commandes/regles";
import { RYTHMES_DEFAUT } from "@/reglages/modele";
import { QUOTAS_DEFAUT } from "@/reglages/quotas";
import {
  corpsDeProposition,
  instantDeParis,
  isoParis,
  lireOccupes,
  programmationAcceptee,
  proposerSemaine,
  propositionCalendrier,
  type EntreesSemaine,
  type LigneSemaine,
} from "@/planification/regles";

const LUNDI = "2099-03-02";
const MAINTENANT = new Date("2099-03-01T08:00:00Z");
const ligne = (id: string, surcharge: Partial<LigneSemaine> = {}): LigneSemaine => ({
  id,
  reseau: "tiktok",
  compte: "tiktok:compte-fictif-1",
  type_contenu: "video",
  instant: instantDeParis(LUNDI, "09:00"),
  fixe: false,
  ...surcharge,
});
const entrees = (lignes: LigneSemaine[], surcharge: Partial<EntreesSemaine> = {}): EntreesSemaine => ({
  lundi: LUNDI,
  lignes,
  rythmes: { ...RYTHMES_DEFAUT, tiktok: { min: 1, max: 7 } },
  quotas: QUOTAS_DEFAUT,
  occupes: [],
  maintenant: MAINTENANT,
  ...surcharge,
});

describe("planification · heures de Paris", () => {
  it("l'heure d'hiver et l'heure d'été se lisent à Paris, avec leur décalage", () => {
    expect(instantDeParis("2099-01-12", "09:00").toISOString()).toBe("2099-01-12T08:00:00.000Z");
    expect(instantDeParis("2099-07-12", "09:00").toISOString()).toBe("2099-07-12T07:00:00.000Z");
    expect(isoParis(instantDeParis("2099-01-12", "09:00"))).toBe("2099-01-12T09:00:00+01:00");
    expect(isoParis(instantDeParis("2099-07-12", "09:00"))).toBe("2099-07-12T09:00:00+02:00");
  });
});

describe("planification · le tirage", () => {
  it("est le même à chaque fois (aucun hasard) et rend un jour de la semaine, dans l'avenir", () => {
    const e = entrees([ligne("3"), ligne("1"), ligne("2")]);
    const a = proposerSemaine(e);
    expect(proposerSemaine(e)).toEqual(a);
    expect(a.propositions.map((p) => p.ligne)).toEqual(["1", "2", "3"]);
    for (const p of a.propositions) {
      expect(p.jour >= LUNDI && p.jour <= "2099-03-08").toBe(true);
      expect(p.instant.getTime()).toBeGreaterThan(MAINTENANT.getTime());
    }
  });

  it("ne propose jamais un créneau déjà occupé du Studio (même un voisin à moins de 90 minutes)", () => {
    const pris = [
      { reseau: "tiktok", debut: instantDeParis("2099-03-02", "09:00") },
      { reseau: "tiktok", debut: instantDeParis("2099-03-03", "09:30") },
    ];
    const { propositions } = proposerSemaine(entrees([ligne("1"), ligne("2"), ligne("3")], { occupes: pris, rythmes: { ...RYTHMES_DEFAUT, tiktok: { min: 1, max: 14 } } }));
    for (const p of propositions) {
      for (const o of pris) expect(Math.abs(p.instant.getTime() - o.debut.getTime())).toBeGreaterThanOrEqual(90 * 60_000);
    }
    expect(propositions).toHaveLength(3);
  });

  it("rend toute la semaine sans créneau quand le Studio la dit pleine pour ce réseau", () => {
    const pleine = ["02", "03", "04", "05", "06", "07", "08"].flatMap((j) => ["09:00", "12:30", "18:00"].map((h) => ({ reseau: "tiktok", debut: instantDeParis(`2099-03-${j}`, h) })));
    const r = proposerSemaine(entrees([ligne("1")], { occupes: pleine, rythmes: { ...RYTHMES_DEFAUT, tiktok: { min: 1, max: 99 } } }));
    expect(r.propositions).toEqual([]);
    expect(r.reportees).toHaveLength(1);
    expect(r.reportees[0].raison).toMatch(/Aucun créneau libre/);
  });

  it("respecte le rythme : pas plus que le milieu du rythme par semaine, créneaux du Studio compris", () => {
    const rythmes = { ...RYTHMES_DEFAUT, tiktok: { min: 2, max: 2 } };
    const occupes = [{ reseau: "tiktok", debut: instantDeParis("2099-03-04", "09:00") }];
    const r = proposerSemaine(entrees([ligne("1"), ligne("2"), ligne("3")], { rythmes, occupes, quotas: { ...QUOTAS_DEFAUT, tiktok: { ...QUOTAS_DEFAUT.tiktok, video: { periode: "semaine", quantite: 9 } } } }));
    expect(r.propositions).toHaveLength(1);
    expect(r.reportees.map((x) => x.ligne)).toEqual(["2", "3"]);
  });

  it("respecte le quota de la semaine par réseau et par type, et le zéro", () => {
    const quotas = { ...QUOTAS_DEFAUT, tiktok: { ...QUOTAS_DEFAUT.tiktok, video: { periode: "semaine" as const, quantite: 2 } } };
    const r = proposerSemaine(entrees([ligne("1"), ligne("2"), ligne("3")], { quotas }));
    expect(r.propositions).toHaveLength(2);
    expect(r.reportees[0].ligne).toBe("3");
    const zero = { ...QUOTAS_DEFAUT, tiktok: { ...QUOTAS_DEFAUT.tiktok, video: { periode: "jour" as const, quantite: 0 } } };
    expect(proposerSemaine(entrees([ligne("1")], { quotas: zero })).propositions).toEqual([]);
  });

  it("anti-répétition : un même type sur un même réseau n'est pas posé deux jours de suite quand un autre jour existe", () => {
    const quotas = { ...QUOTAS_DEFAUT, tiktok: { ...QUOTAS_DEFAUT.tiktok, video: { periode: "semaine" as const, quantite: 3 } } };
    const r = proposerSemaine(entrees([ligne("1"), ligne("2"), ligne("3")], { quotas }));
    const jours = r.propositions.map((p) => p.jour).sort();
    for (let i = 1; i < jours.length; i++) {
      expect(Date.parse(jours[i]) - Date.parse(jours[i - 1])).toBeGreaterThan(86_400_000);
    }
  });

  it("un jour choisi par le fondateur (ou déjà au Studio) n'est jamais déplacé ni proposé de nouveau", () => {
    const choisie = ligne("1", { fixe: true, instant: instantDeParis("2099-03-05", "09:00") });
    const r = proposerSemaine(entrees([choisie, ligne("2")]));
    expect(r.propositions.map((p) => p.ligne)).toEqual(["2"]);
    expect(r.propositions[0].jour).not.toBe("2099-03-05");
  });

  it("réseau au repos, compte absent et YouTube sont rendus avec leur raison", () => {
    const rythmes = { ...RYTHMES_DEFAUT, tiktok: { min: 0, max: 0 } };
    expect(proposerSemaine(entrees([ligne("1")], { rythmes })).reportees[0].raison).toMatch(/repos/);
    expect(proposerSemaine(entrees([ligne("1", { compte: null })])).reportees[0].raison).toMatch(/compte/);
    expect(proposerSemaine(entrees([ligne("1", { reseau: "youtube" })])).reportees[0].raison).toMatch(/YouTube/);
  });

  it("ne propose rien dans le passé", () => {
    const r = proposerSemaine(entrees([ligne("1")], { maintenant: new Date("2099-03-05T20:00:00Z") }));
    for (const p of r.propositions) expect(p.jour >= "2099-03-05").toBe(true);
  });
});

describe("planification · la porte (appels 4 et 7)", () => {
  const cle = cleCommande("42");
  const prete = { reseau: "tiktok", compte: "tiktok:compte-fictif-1", type_contenu: "video", instant: instantDeParis("2099-03-04", "09:00") };

  it("la proposition porte l'origine « usine », une clé stable et rien d'autre : ni état, ni montant, ni diffuseur", () => {
    const corps = corpsDeProposition(cle, prete, MAINTENANT);
    if (!corps) throw new Error("refus inattendu");
    expect(corps.contrat).toBe(2);
    const p = corps.propositions[0];
    expect(p.origine).toBe("usine");
    expect(p.dueAt).toBe("2099-03-04T09:00:00+01:00");
    expect(p.jour_vise).toBe("2099-03-04");
    expect(corpsDeProposition(cle, prete, MAINTENANT)).toEqual(corps);
    expect(Object.keys(p).sort()).toEqual(["compte", "cle_proposition", "dueAt", "jour_vise", "origine", "reseau", "type_contenu"].sort());
    expect(JSON.stringify(corps)).not.toMatch(/statut|etat|programm|publi|zernio|buffer|eur|cent|prix|budget/i);
    expect(propositionCalendrier.safeParse({ ...p, etat: "programmee" }).success).toBe(false);
  });

  it("une ligne sans compte ou dans le passé ne fait aucune proposition", () => {
    expect(corpsDeProposition(cle, { ...prete, compte: null }, MAINTENANT)).toBeNull();
    expect(corpsDeProposition(cle, prete, new Date("2100-01-01T00:00:00Z"))).toBeNull();
  });

  it("lit les créneaux pris, refuse une réponse illisible", () => {
    expect(lireOccupes(200, [{ reseau: "tiktok", debut: "2099-03-04T09:00:00+01:00" }])).toHaveLength(1);
    expect(lireOccupes(200, { x: 1 })).toBeNull();
    expect(lireOccupes(503, [])).toBeNull();
    expect(lireOccupes(200, [{ reseau: "tiktok", debut: "pas une date" }])).toBeNull();
    expect(programmationAcceptee(200, { entrees: [{ cle_proposition: "a", origine_date: "usine" }], deja: true })).toBe(true);
    expect(programmationAcceptee(409, {})).toBe(false);
  });
});

describe("planification · service sous « Tout arrêter » et interrupteur", () => {
  it("éteint ou arrêté : aucun appel ne part, sans lecture ni écriture", async () => {
    vi.resetModules();
    const lireOccupesDuStudio = vi.fn();
    const appelerStudio = vi.fn();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/passerelles/studio", () => ({ lireOccupesDuStudio, appelerStudio }));
    vi.doMock("@/donnees", () => ({ interrupteurAllume: vi.fn(async () => false), journaliser: vi.fn() }));
    vi.doMock("@/arret", () => ({ sousArret: vi.fn(async () => ({ fait: false, raison: "arrete" })) }));
    vi.doMock("@/commandes/service", () => ({ proposerAuStudio: vi.fn(), commandesAllumees: vi.fn(async () => true) }));
    vi.doMock("@/lib/base", () => ({ requete: vi.fn(), transaction: vi.fn() }));
    vi.doMock("@/reglages", () => ({ lireReglagesTirage: vi.fn(), lireQuotas: vi.fn() }));
    const { proposerLaSemaine } = await import("@/planification");
    const r = await proposerLaSemaine("2099-03-02");
    expect(r.envoyees).toBe(0);
    expect(r.message).toMatch(/éteint/);
    expect(lireOccupesDuStudio).not.toHaveBeenCalled();
    expect(appelerStudio).not.toHaveBeenCalled();

    vi.resetModules();
    vi.doMock("@/donnees", () => ({ interrupteurAllume: vi.fn(async () => true), journaliser: vi.fn() }));
    const { proposerLaSemaine: allumee } = await import("@/planification");
    const arret = await allumee("2099-03-02");
    expect(arret.message).toMatch(/arrêté/);
    expect(lireOccupesDuStudio).not.toHaveBeenCalled();
    expect(appelerStudio).not.toHaveBeenCalled();
  });
});

/** Service avec une base et un Studio fictifs : rend les appels faits, pour vérifier ce qui part et ce qui s'écrit. */
async function service(opts: { lignes?: Record<string, unknown>[]; lecture?: () => Promise<unknown>; commandes?: boolean; occupes?: unknown } = {}) {
  vi.resetModules();
  const ecritures: unknown[][] = [];
  const selects: string[] = [];
  const lireOccupesDuStudio = vi.fn(opts.lecture ?? (async () => ({ envoye: true, statut: 200, corps: opts.occupes ?? [] })));
  const appelerStudio = vi.fn(async () => ({ envoye: true, statut: 201, corps: { entrees: [{ cle_proposition: "a", origine_date: "usine" }] } }));
  const proposerAuStudio = vi.fn<(id: string) => Promise<{ etat_envoi: string; message: string }>>(async () => ({ etat_envoi: "envoyee", message: "" }));
  const lignes = opts.lignes ?? [];
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/passerelles/studio", () => ({ lireOccupesDuStudio, appelerStudio }));
  vi.doMock("@/donnees", () => ({ interrupteurAllume: vi.fn(async () => true), journaliser: vi.fn() }));
  vi.doMock("@/arret", () => ({ sousArret: vi.fn(async (_n: string, f: () => Promise<unknown>) => ({ fait: true, valeur: await f() })) }));
  vi.doMock("@/commandes/service", () => ({ proposerAuStudio, commandesAllumees: vi.fn(async () => opts.commandes ?? true) }));
  vi.doMock("@/reglages", () => ({
    lireReglagesTirage: vi.fn(async () => ({ rythmes: { ...RYTHMES_DEFAUT, tiktok: { min: 1, max: 7 } } })),
    lireQuotas: vi.fn(async () => QUOTAS_DEFAUT),
  }));
  const requete = vi.fn(async (sql: string, params?: unknown[]) => {
    if (/^\s*UPDATE/.test(sql)) {
      ecritures.push([sql, params]);
      const l = lignes.find((x) => x.id === params?.[0]);
      if (l) l.prevue_le = params?.[1];
      return [];
    }
    if (/FROM calendrier_ligne c/.test(sql)) {
      selects.push(sql);
      return lignes;
    }
    if (/FROM calendrier_ligne WHERE id/.test(sql)) return lignes.filter((x) => x.id === params?.[0]);
    return [];
  });
  vi.doMock("@/lib/base", () => ({ requete, transaction: vi.fn(async (f: () => Promise<unknown>) => f()) }));
  const { proposerLaSemaine } = await import("@/planification");
  return { proposerLaSemaine, ecritures, selects, lireOccupesDuStudio, appelerStudio, proposerAuStudio };
}
const baseLigne = (id: string, s: Record<string, unknown> = {}) => ({
  id,
  reseau: "tiktok",
  compte: "tiktok:compte-fictif-1",
  type_contenu: "video",
  prevue_le: instantDeParis("2099-03-02", "09:00"),
  etat: "brouillon",
  date_choisie: false,
  commandee: false,
  deplacable: true,
  ...s,
});

describe("planification · le service touche seulement ce qui peut l'être", () => {
  it("ne tire que les brouillons pas encore au Studio et à venir ; le reste de la semaine ne bouge ni ne part", async () => {
    const s = await service({
      lignes: [
        baseLigne("1", { etat: "programmee", deplacable: false }),
        baseLigne("2", { etat: "publiee", deplacable: false }),
        baseLigne("3", { prevue_le: new Date("2000-01-01T09:00:00Z"), deplacable: false }),
        baseLigne("4"),
        baseLigne("5", { commandee: true, deplacable: false }),
        baseLigne("6", { commandee: true, deplacable: false, etat_studio: "programmee" }),
        baseLigne("7", { commandee: true, deplacable: false, etat_studio: "publiee" }),
        baseLigne("8", { commandee: true, deplacable: false, etat_studio: "echec" }),
      ],
    });
    await s.proposerLaSemaine(LUNDI);
    expect(s.selects[0]).toMatch(/c\.etat = 'brouillon' AND \(c\.etat_studio IS NULL OR c\.etat_studio = 'en_attente'\) AND c\.prevue_le > now\(\)/);
    expect(s.ecritures.map((e) => (e[1] as unknown[])[0])).toEqual(["4"]);
    expect(String(s.ecritures[0][0])).toMatch(/etat = 'brouillon'/);
    expect(s.proposerAuStudio.mock.calls.map((c) => c[0])).toEqual(["4"]);
    // Jamais de seconde publication : une ligne commandée non déplaçable (dont programmée, publiée, en échec côté Studio) ne repart pas.
    for (const id of ["5", "6", "7", "8"]) {
      expect(s.proposerAuStudio.mock.calls.map((c) => c[0])).not.toContain(id);
      expect(JSON.stringify(s.appelerStudio.mock.calls)).not.toContain(cleCommande(id));
    }
  });

  it("une date choisie, même déjà commandée, ne repart jamais en appel 4 ni ne bouge", async () => {
    const s = await service({ lignes: [baseLigne("1", { date_choisie: true, commandee: true })] });
    await s.proposerLaSemaine(LUNDI);
    expect(s.ecritures).toEqual([]);
    expect(s.proposerAuStudio).not.toHaveBeenCalled();
    expect(s.appelerStudio).not.toHaveBeenCalled();
  });

  it("interrupteur des échanges éteint : ni lecture, ni écriture, ni envoi", async () => {
    const s = await service({ lignes: [baseLigne("1")], commandes: false });
    const r = await s.proposerLaSemaine(LUNDI);
    expect(r.message).toMatch(/éteints/);
    expect(s.lireOccupesDuStudio).not.toHaveBeenCalled();
    expect(s.selects).toEqual([]);
    expect(s.ecritures).toEqual([]);
    expect(s.proposerAuStudio).not.toHaveBeenCalled();
    expect(s.appelerStudio).not.toHaveBeenCalled();
  });
});

describe("planification · les créneaux pris sont lus avant tout", () => {
  it.each([
    ["la lecture échoue", () => Promise.reject(new Error("réseau")), undefined],
    ["la réponse est illisible", undefined, { x: 1 }],
  ])("%s : aucune commande, aucun créneau, aucune écriture", async (_nom, lecture, occupes) => {
    const s = await service({ lignes: [baseLigne("1")], lecture, occupes });
    const r = await s.proposerLaSemaine(LUNDI);
    expect(r.envoyees).toBe(0);
    expect(r.message).toMatch(/pas pu lire/);
    expect(s.proposerAuStudio).not.toHaveBeenCalled();
    expect(s.appelerStudio).not.toHaveBeenCalled();
    expect(s.ecritures).toEqual([]);
  });

  it("une relance de la même semaine ne crée aucun doublon : mêmes clés, aucune date déplacée", async () => {
    const lignes = [baseLigne("1"), baseLigne("2")];
    const s = await service({ lignes });
    await s.proposerLaSemaine(LUNDI);
    const premiers = s.appelerStudio.mock.calls.map((c) => JSON.stringify(c));
    expect(premiers).toHaveLength(2);
    const dates = lignes.map((l) => l.prevue_le);
    const avant = s.ecritures.length;
    for (const l of lignes) l.commandee = true; // ce que le Studio a reçu : désormais fixes
    await s.proposerLaSemaine(LUNDI);
    expect(s.ecritures).toHaveLength(avant);
    expect(lignes.map((l) => l.prevue_le)).toEqual(dates);
    expect(s.appelerStudio.mock.calls.slice(2).map((c) => JSON.stringify(c))).toEqual(premiers);
  });
});
