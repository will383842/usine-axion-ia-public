/**
 * UO-14 · Apporteurs d'affaires et formateurs : une ligne à la fois, à valider par le fondateur, contrôlée sur les
 * interdits de portée « recrutement ». Le tirage automatique reste réservé au public Clients.
 * Tout se lit dans les bases fictives de tests/fixtures-bases/ ; aucun mot interdit n'est écrit ici.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODES_PUBLIC, type Paquet } from "@/contrats";
import { lireFichiersBases } from "@/import/importer";
import { preparer } from "@/import/preparation";
import { commandable, controlerLigne, ligneUnitaire, type LigneUnitaire } from "@/lots/apporteurs-formateurs";
import type { ContexteControle, InterditControle } from "@/lots/controle";
import { formatsDuTirage, tirer, type BasesTirage, type HistoriqueTirage, type ReglagesTirage } from "@/tirage";

const [CLIENTS, APPORTEURS, FORMATEURS] = CODES_PUBLIC;

const fichiers = await lireFichiersBases(join(process.cwd(), "tests", "fixtures-bases", "bases"));
const preparation = preparer(fichiers);
const table = (nom: string) => preparation.tables.find((t) => t.table === nom)!.lignes as never[] as Record<string, string | null>[];

const INTERDITS: InterditControle[] = table("interdit").map((l) => ({ code: l.code!, expression: l.expression, remplacement: l.remplacement, raison: l.raison, portee: l.portee }));
const DE_RECRUTEMENT = INTERDITS.filter((i) => (i.portee ?? "").startsWith("recrutement"));

const contexte = (autres: Partial<ContexteControle> = {}): ContexteControle => ({
  interdits: INTERDITS,
  reseaux: ["instagram", "facebook"],
  comptes: [],
  motsBranches: [],
  ...autres,
});

const paquetAvec = (texte: string): Paquet => ({
  serie: "formation",
  sujet: `${texte} [usine:L1-1]`,
  public: "Un public d'exemple",
  vraiCas: null,
  reseau: "fil",
  fin: { type: "diagnostic" },
  envoi: "Le diagnostic en ligne.",
});

/** Les bases d'essai, dans la forme que lit le tirage. */
function basesTirage(): BasesTirage {
  const metiers = table("metier");
  return {
    metiers: metiers.map((m) => ({ code: m.code!, tailles_typiques: m.tailles_typiques })),
    tailles: table("taille").map((t) => ({ code: t.code!, poids: t.poids })),
    services: ["formation", "audit", "coaching", "integration"],
    douleurs: table("douleur") as never,
    cas: table("cas_usage") as never,
    accroches: table("accroche") as never,
    appels: table("appel") as never,
    formats: formatsDuTirage(table("format_video") as never, table("format_autre") as never),
    actualites: [],
    comptes: [
      { code: "instagram:essai", reseau: "instagram", lien_profil: null },
      { code: "facebook:essai", reseau: "facebook", lien_profil: null },
    ],
    motsBranches: [],
  };
}

describe("UO-14 · tirage automatique : public Clients seulement", () => {
  it("toutes les lignes tirées sur les bases d'essai ont public.clients", () => {
    const reglages: ReglagesTirage = {
      reseaux: ["instagram", "facebook"],
      poidsTailles: {},
      poidsServices: {},
      partsFormats: { instagram: { "tableau-anime": 100 }, facebook: { "tableau-anime": 100 } },
      rythmeActualites: 0,
      delaiCasJours: 0,
      finRendezVous: false,
      graine: 7,
      maintenant: new Date("2026-11-15T09:00:00Z"),
    };
    const vide: HistoriqueTirage = { lignes: [], dejaFabrique: [] };
    const r = tirer(5, reglages, vide, basesTirage());
    expect(r.lignes.length).toBeGreaterThan(0);
    expect(r.lignes.every((l) => l.public === CLIENTS)).toBe(true);
  });
});

describe("UO-14 · ligneUnitaire", () => {
  it("accepte les apporteurs d'affaires et les formateurs, et rend une ligne à valider", () => {
    for (const p of [APPORTEURS, FORMATEURS] as const) {
      const r = ligneUnitaire(p, "Un sujet d'exemple");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.ligne).toMatchObject({ public: p, sujet: "Un sujet d'exemple", etat: "a_valider" });
        expect(r.ligne.mention).toBe("à valider par le fondateur");
      }
    }
  });

  it("refuse le public Clients, avec une phrase en français", () => {
    const r = ligneUnitaire(CLIENTS, "Un sujet d'exemple");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(/^[A-ZÉ].*\.$/);
  });

  it("refuse un code de public inconnu et un sujet vide", () => {
    expect(ligneUnitaire("public.autre" as never, "Un sujet").ok).toBe(false);
    expect(ligneUnitaire(APPORTEURS, "   ").ok).toBe(false);
  });
});

describe("UO-14 · commandable", () => {
  const ligne = (): LigneUnitaire => {
    const r = ligneUnitaire(APPORTEURS, "Un sujet d'exemple");
    if (!r.ok) throw new Error(r.raison);
    return r.ligne;
  };

  it("est faux sans validation explicite", () => {
    expect(commandable(ligne())).toBe(false);
    expect(commandable(ligne(), null)).toBe(false);
    expect(commandable(ligne(), undefined)).toBe(false);
  });

  it("est faux pour une validation d'une autre ligne, vrai pour la sienne", () => {
    const l = ligne();
    expect(commandable(l, { sujet: "Un autre sujet", public: l.public, le: new Date("2026-11-15T09:00:00Z") })).toBe(false);
    expect(commandable(l, { sujet: l.sujet, public: FORMATEURS, le: new Date("2026-11-15T09:00:00Z") })).toBe(false);
    expect(commandable(l, { sujet: l.sujet, public: l.public, le: new Date("2026-11-15T09:00:00Z") })).toBe(true);
  });
});

describe("UO-14 · controlerLigne : interdits de portée recrutement", () => {
  it("les bases d'essai portent les trois interdits de recrutement attendus", () => {
    expect(DE_RECRUTEMENT.map((i) => i.code)).toEqual(expect.arrayContaining(["interdit.recrutement-revenu", "interdit.recrutement-facile", "interdit.verification-apporteur"]));
  });

  // Les motifs intégrés de controle.ts portent sur des mots précis ; ici l'expression citée par la base d'essai
  // fait foi : chaque interdit de recrutement est repris sous un code neutre pour que ce soit elle qui joue.
  const neutres: InterditControle[] = DE_RECRUTEMENT.map((i) => ({ ...i, code: `${i.code}-essai` }));
  const citee = (i: InterditControle) => /«\s*([^»]+?)\s*»/.exec(i.expression ?? "")![1];

  for (const i of neutres) {
    it(`${i.code} : refusé pour les apporteurs d'affaires et les formateurs, avec la raison de la base 8, pas pour les clients`, () => {
      const texte = `Une phrase avec ${citee(i)} dedans`;
      const ctx = contexte({ interdits: neutres });
      for (const p of [APPORTEURS, FORMATEURS] as const) {
        const l = ligneUnitaire(p, texte);
        if (!l.ok) throw new Error(l.raison);
        const r = controlerLigne(l.ligne, paquetAvec(texte), ctx);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          const refus = r.refus.find((x) => x.code === i.code);
          expect(refus?.raison).toContain(i.raison!);
        }
      }
      // Dans le sens inverse : une ligne portée par le public Clients n'est pas refusée pour cet interdit.
      const rc = controlerLigne({ public: CLIENTS, sujet: texte } as never, paquetAvec(texte), ctx);
      expect(rc.ok).toBe(true);
    });
  }

  it("le public passé dans le contexte ne remplace pas celui de la ligne", () => {
    const i = neutres[0];
    const texte = `Une phrase avec ${citee(i)} dedans`;
    const l = ligneUnitaire(APPORTEURS, texte);
    if (!l.ok) throw new Error(l.raison);
    expect(controlerLigne(l.ligne, paquetAvec(texte), contexte({ interdits: neutres, public: CLIENTS })).ok).toBe(false);
  });
});
