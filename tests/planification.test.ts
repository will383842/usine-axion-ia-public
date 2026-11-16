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
    vi.doMock("@/commandes/service", () => ({ proposerAuStudio: vi.fn() }));
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
