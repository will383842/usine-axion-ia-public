/**
 * L8-18 · Poids des mesures dans le tirage. Éteint (défaut), le poids vaut 1 et le tirage est celui d'avant ;
 * allumé (ici seulement) : poids borné de 1 à 1,5, effectif inférieur à 3 ignoré, exploration, graine, « pourquoi ».
 * Mesures et bases fictives, injectées en paramètre ; aucune donnée de personne.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { poidsMesuresAllume } from "@/tirage/charger";
import { tirer, poidsDesMesures, POIDS_MIN, POIDS_MAX, PART_EXPLORATION, SEUIL_EFFECTIF } from "@/tirage/tirer";
import type { BasesTirage, HistoriqueTirage, MesureTirage, ReglagesTirage } from "@/tirage/types";

const SERVICES = ["formation", "audit"];
const FAMILLES = ["scène vécue", "constat partagé", "contre-pied", "énumération", "idée reçue corrigée"];
const VIDE: HistoriqueTirage = { lignes: [], dejaFabrique: [] };

function bases(): BasesTirage {
  const metiers = Array.from({ length: 12 }, (_, i) => ({ code: `essai.metier-${i}`, tailles_typiques: null }));
  const appel = (code: string, type: string, objectif: string) => ({ code, reseaux: "instagram ; facebook", cible: "clients", type_contenu: "video ; image", type, objectif, dit: "Une phrase.", ecran: "Un écran", legende: null, mot: null, emplacement: null });
  return {
    metiers,
    tailles: ["TPE", "PME", "ETI", "GE"].map((code) => ({ code, poids: "1" })),
    services: SERVICES,
    douleurs: [],
    cas: metiers.flatMap((m) => SERVICES.flatMap((s) => [1, 2, 3].map((k) => ({ code: `${m.code}.${s}.c0${k}`, cible: m.code, service: s, douleurs: null, phare: null, sujet: `a.${s}`, formats_conseilles: null })))),
    accroches: FAMILLES.map((famille, i) => ({ code: `accroche.essai-${i}`, famille, types_contenu: "video ; image" })),
    appels: [appel("fin-essai-question", "question", "QUESTION"), appel("fin-essai-envoi", "envoi", "PARTAGER")],
    formats: [
      { code: "tableau-anime", type_contenu: "video", en_service: true },
      { code: "image-essai", type_contenu: "image", en_service: true },
    ],
    actualites: [],
    comptes: [{ code: "instagram:compte-essai", reseau: "instagram", lien_profil: null }, { code: "facebook:page-essai", reseau: "facebook", lien_profil: null }],
    motsBranches: [],
  };
}

function reglages(autres: Partial<ReglagesTirage> = {}): ReglagesTirage {
  return {
    reseaux: ["instagram", "facebook"],
    poidsTailles: {},
    poidsServices: {},
    partsFormats: { instagram: { "tableau-anime": 100, "image-essai": 100 }, facebook: { "tableau-anime": 100, "image-essai": 100 } },
    rythmeActualites: 0,
    delaiCasJours: 30,
    finRendezVous: false,
    graine: 7,
    maintenant: new Date("2026-10-12T09:00:00Z"),
    ...autres,
  };
}

const m = (type_contenu: MesureTirage["type_contenu"], reseau: MesureTirage["reseau"], effectif: number, score: number): MesureTirage => ({ type_contenu, reseau, effectif, score });
const MESURES_IMAGE: MesureTirage[] = [m("image", "instagram", 10, 1), m("image", "facebook", 10, 1), m("video", "instagram", 10, 0), m("video", "facebook", 10, 0)];
const MESURES_VIDEO: MesureTirage[] = [m("video", "instagram", 10, 1), m("video", "facebook", 10, 1), m("image", "instagram", 10, 0), m("image", "facebook", 10, 0)];
const empreinte = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
// Empreinte du tirage de référence, calculée sur le code d'avant L8-18 (graine 7, 30 lignes, bases ci-dessus).
const EMPREINTE_AVANT = "70976860112709b0e031ce45d3616fa605915db59f95c582736a0a197c712a66";

describe("L8-18 · interrupteur éteint : le tirage est celui d'aujourd'hui", () => {
  it("l'interrupteur n'est allumé que par « 1 » ou « true »", () => {
    expect(poidsMesuresAllume({})).toBe(false);
    for (const v of ["", "0", "non", "TRUE", "oui", " 1", "1 ", "vrai"]) expect(poidsMesuresAllume({ TIRAGE_POIDS_MESURES: v })).toBe(false);
    expect(poidsMesuresAllume({ TIRAGE_POIDS_MESURES: "1" })).toBe(true);
    expect(poidsMesuresAllume({ TIRAGE_POIDS_MESURES: "true" })).toBe(true);
  });

  it("sans réglage ni mesure, le tirage est identique à celui d'avant (même empreinte)", () => {
    expect(empreinte(tirer(30, reglages(), VIDE, bases()))).toBe(EMPREINTE_AVANT);
  });

  it("éteint, des mesures reçues ne changent rien et aucune ligne ne porte « pourquoi »", () => {
    const sans = tirer(30, reglages(), VIDE, bases());
    const avec = tirer(30, reglages({ poidsMesures: false, mesures: MESURES_IMAGE }), VIDE, bases());
    expect(JSON.stringify(avec)).toBe(JSON.stringify(sans));
    expect(avec.lignes.some((l) => "pourquoi" in l)).toBe(false);
    expect(poidsDesMesures(false, MESURES_IMAGE, "image", "instagram")).toBe(1);
  });
});

describe("L8-18 · allumé : poids borné", () => {
  it("les constantes sont celles proposées", () => {
    expect([POIDS_MIN, POIDS_MAX, PART_EXPLORATION, SEUIL_EFFECTIF]).toEqual([1, 1.5, 0.2, 3]);
  });

  it("le poids reste entre 1 et 1,5 ; sans mesure il vaut 1", () => {
    expect(poidsDesMesures(true, [], "image", "instagram")).toBe(1);
    expect(poidsDesMesures(true, undefined, "image", "instagram")).toBe(1);
    expect(poidsDesMesures(true, [m("image", "instagram", 10, 1)], "image", "instagram")).toBe(1.5);
    expect(poidsDesMesures(true, [m("image", "instagram", 10, 0)], "image", "instagram")).toBe(1);
    expect(poidsDesMesures(true, [m("image", "instagram", 10, 0.6)], "image", "instagram")).toBeCloseTo(1.3, 10);
    for (const score of [-5, 7, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = poidsDesMesures(true, [m("image", "instagram", 10, score)], "image", "instagram");
      expect(p).toBeGreaterThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(1.5);
    }
    expect(poidsDesMesures(true, [m("image", "instagram", 10, 1)], "image", "facebook")).toBe(1);
  });

  it("une case d'effectif inférieur à 3 n'est jamais utilisée", () => {
    expect(poidsDesMesures(true, [m("image", "instagram", 2, 1)], "image", "instagram")).toBe(1);
    expect(poidsDesMesures(true, [m("image", "instagram", 3, 1)], "image", "instagram")).toBe(1.5);
    const faibles = MESURES_IMAGE.map((x) => ({ ...x, effectif: 2 }));
    const a = tirer(30, reglages({ poidsMesures: true, mesures: faibles }), VIDE, bases());
    const b = tirer(30, reglages({ poidsMesures: true }), VIDE, bases());
    expect(a.lignes.map((l) => l.format)).toEqual(b.lignes.map((l) => l.format));
  });
});

describe("L8-18 · allumé : exploration, graine, pourquoi", () => {
  const allume = (mesures: MesureTirage[], graine = 7) => tirer(100, reglages({ poidsMesures: true, mesures, graine }), VIDE, bases());

  it("sur 100 lignes, au moins 20 % sont tirées au hasard (exploration)", () => {
    const r = allume(MESURES_IMAGE);
    expect(r.lignes).toHaveLength(100);
    expect(r.lignes.filter((l) => l.pourquoi === "tiré au hasard (exploration)").length).toBeGreaterThanOrEqual(20);
  });

  it("à graine égale le tirage est identique ; deux jeux de mesures donnent deux tirages", () => {
    expect(JSON.stringify(allume(MESURES_IMAGE))).toBe(JSON.stringify(allume(MESURES_IMAGE)));
    const image = allume(MESURES_IMAGE).lignes.map((l) => l.format);
    const video = allume(MESURES_VIDEO).lignes.map((l) => l.format);
    expect(image).not.toEqual(video);
    expect(image.filter((f) => f === "image-essai").length).toBeGreaterThan(video.filter((f) => f === "image-essai").length);
  });

  it("chaque ligne dit pourquoi, en français simple, sans identifiant de personne", () => {
    const r = allume(MESURES_IMAGE);
    for (const l of r.lignes) {
      expect(typeof l.pourquoi).toBe("string");
      expect(l.pourquoi).toMatch(/^(tiré au hasard \(exploration\)|poids 1,\d : bonnes mesures sur ce type et ce réseau|poids 1 : pas assez de mesures sur ce type et ce réseau)$/);
    }
    expect(r.lignes.some((l) => /^poids 1,\d : /.test(l.pourquoi ?? ""))).toBe(true);
  });
});
