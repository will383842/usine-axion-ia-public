/**
 * T02 · Import des bases, sans base : refus du fichier entier (code en double, état invalide, renvoi introuvable,
 * mauvais nombre de colonnes) et règles de lecture de CONTRATS-ECHANGE.md § 2, une par règle.
 */
import { describe, expect, it } from "vitest";
import { TYPES_CONTENU } from "@/contrats";
import { COLONNES_BASES, type NomTableBase } from "@/donnees/schema";
import { preparer, type FichierBase } from "@/import/preparation";
import { formatsConseilles, lireListe, lireReseau, soucisAppuyes, taillesDouleur, typesContenu } from "@/import/regles";

type Ligne = Record<string, string>;

/** Un tableau `## table:` aux colonnes exactes de la table ; les champs non donnés sont vides. */
function table(nom: NomTableBase, lignes: Ligne[]): string {
  const cols = COLONNES_BASES[nom];
  const communs: Ligne = { etat: "propose", version: "1", origine: "propose" };
  return [
    `## table: ${nom}`,
    "",
    `| ${cols.join(" | ")} |`,
    `|${cols.map(() => "---").join("|")}|`,
    ...lignes.map((l) => `| ${cols.map((c) => ({ ...communs, ...l })[c] ?? "").join(" | ")} |`),
    "",
  ].join("\n");
}

const M = "btp.plombier";
function cibles(extra: { douleurs?: Ligne[]; metiers?: Ligne[] } = {}): FichierBase {
  return {
    nom: "1-cibles.md",
    texte: [
      "# Base 1",
      table("secteur", [{ code: "btp_immobilier" }]),
      table("metier", extra.metiers ?? [{ code: M, secteur: "btp_immobilier", tailles_typiques: "TPE ; PME" }]),
      table("public", [{ code: "public.clients" }]),
      table("douleur", extra.douleurs ?? [{ code: `${M}.d1`, cible: M }]),
      table("souci_releve", [{ code: `${M}.s01`, numero: "S1", cible: M, force: "faible (recoupée en partie)", origine: "repris", source: "Exemple" }]),
    ].join("\n"),
  };
}
const sujets: FichierBase = {
  nom: "3-sujets.md",
  texte: [
    table("famille", [{ code: "A" }]),
    table("sujet", [{ code: "a.integration", famille: "A" }]),
    table("actualite", [
      { code: "actu.2026-10-12.1", perime_le: "2026-10-17" },
      { code: "actu.2026-10-12.2", perime_le: "" },
    ]),
  ].join("\n"),
};
function cas(lignes: Ligne[]): FichierBase {
  return { nom: "4-cas-d-usage.md", texte: table("cas_usage", lignes) };
}
const casOk: Ligne = { code: `${M}.integration.c01`, cible: M, service: "integration", douleurs: `${M}.d1`, sujet: "a.integration" };

function refus(p: ReturnType<typeof preparer>, fichier: string): string[] {
  return p.fichiersRefuses.find((f) => f.fichier === fichier)?.raisons ?? [];
}

describe("import des bases · refus du fichier entier", () => {
  it("accepte des fichiers justes", () => {
    const p = preparer([cibles(), sujets, cas([casOk])]);
    expect(p.fichiersRefuses).toEqual([]);
    expect(p.tables.map((t) => t.table)).toEqual(["secteur", "metier", "public", "douleur", "souci_releve", "famille", "sujet", "actualite", "cas_usage"]);
  });

  it("refuse un code en double", () => {
    const p = preparer([cibles({ douleurs: [{ code: `${M}.d1`, cible: M }, { code: `${M}.d1`, cible: M }] })]);
    expect(refus(p, "1-cibles.md").join()).toMatch(/code en double « btp\.plombier\.d1 »/);
    expect(p.tables).toEqual([]);
  });

  it("refuse un état hors liste", () => {
    const p = preparer([cibles({ douleurs: [{ code: `${M}.d1`, cible: M, etat: "en_cours" }] })]);
    expect(refus(p, "1-cibles.md").join()).toMatch(/état « en_cours » hors liste/);
  });

  it("refuse une ligne au mauvais nombre de colonnes", () => {
    const f = cibles();
    f.texte = f.texte.replace(`| ${M}.d1 | ${M} |`, `| ${M}.d1 | ${M} | en trop |`);
    expect(refus(preparer([f]), "1-cibles.md").join()).toMatch(/colonnes au lieu de/);
  });

  it("refuse un renvoi introuvable, et le fichier qui renvoie vers un fichier refusé", () => {
    const metierSansSecteur = preparer([cibles({ metiers: [{ code: M, secteur: "inconnu" }] })]);
    expect(refus(metierSansSecteur, "1-cibles.md").join()).toMatch(/secteur « inconnu » introuvable/);

    const casSansDouleur = preparer([cibles(), sujets, cas([{ ...casOk, douleurs: `${M}.d1 ; ${M}.d9` }])]);
    expect(refus(casSansDouleur, "4-cas-d-usage.md").join()).toMatch(/douleurs « btp\.plombier\.d9 » introuvable/);
    expect(refus(casSansDouleur, "1-cibles.md")).toEqual([]);

    const sujetSansFamille = preparer([cibles(), { nom: "3-sujets.md", texte: table("sujet", [{ code: "a.integration", famille: "Z" }]) }, cas([casOk])]);
    expect(refus(sujetSansFamille, "3-sujets.md").join()).toMatch(/famille « Z » introuvable/);
    expect(refus(sujetSansFamille, "4-cas-d-usage.md").join()).toMatch(/sujet « a\.integration » introuvable/);

    const cibleInconnue = preparer([cibles({ douleurs: [{ code: `${M}.d1`, cible: "btp.inconnu" }] })]);
    expect(refus(cibleInconnue, "1-cibles.md").join()).toMatch(/cible « btp\.inconnu » introuvable/);
  });

  it("traite un renvoi vers une ligne refusée comme un renvoi introuvable", () => {
    const douleurRefusee = cibles({ douleurs: [{ code: `${M}.d1`, cible: M, origine: "repris", source: "" }] });
    const p = preparer([douleurRefusee, sujets, cas([casOk])], { douleur: [`${M}.d1`] });
    expect(p.lignesRefusees.map((l) => l.code)).toEqual([`${M}.d1`]);
    expect(refus(p, "4-cas-d-usage.md").join()).toMatch(/douleurs « btp\.plombier\.d1 » introuvable/);
  });

  it("accepte un renvoi vers une ligne déjà en base", () => {
    const p = preparer([sujets, cas([casOk])], { metier: [M], douleur: [`${M}.d1`] });
    expect(p.fichiersRefuses).toEqual([]);
  });

  it("refuse une table inconnue", () => {
    expect(refus(preparer([{ nom: "9-accroches.md", texte: "## table: inventee\n\n| code |\n|---|\n| x |\n" }]), "9-accroches.md").join()).toMatch(/table inconnue/);
  });
});

describe("import des bases · règles de lecture (contrat § 2)", () => {
  it("listes séparées par « ; »", () => {
    expect(lireListe(" TPE ;PME ; ")).toEqual(["TPE", "PME"]);
    expect(lireListe(null)).toEqual([]);
  });

  it("source exigée seulement si origine = repris (la ligne seule est refusée)", () => {
    const p = preparer([sujets, { nom: "9-accroches.md", texte: table("accroche", [
      { code: "accroche.a", origine: "repris", source: "" },
      { code: "accroche.b", origine: "propose", source: "" },
    ]) }]);
    expect(p.fichiersRefuses).toEqual([]);
    expect(p.lignesRefusees.map((l) => l.code)).toEqual(["accroche.a"]);
    const accroches = p.tables.find((t) => t.table === "accroche");
    expect(accroches?.lignes.map((l) => l.code)).toEqual(["accroche.b"]);
    expect(accroches?.codesPresents).toEqual(["accroche.a", "accroche.b"]);
  });

  it("appel.cible = x se lit public.x", () => {
    const p = preparer([{ nom: "7-appels.md", texte: table("appel", [{ code: "fin-ig-essai", cible: "clients" }]) }]);
    expect(p.tables[0].lignes[0].cible).toBe("public.clients");
  });

  it("cas_origine qui n'est pas un code = vide", () => {
    const p = preparer([cibles(), sujets, cas([
      { ...casOk, cas_origine: "nouveau" },
      { ...casOk, code: `${M}.integration.c02`, cas_origine: `${M}.integration.c01` },
    ])]);
    const lignes = p.tables.find((t) => t.table === "cas_usage")?.lignes ?? [];
    expect(lignes.map((l) => l.cas_origine)).toEqual([null, `${M}.integration.c01`]);
  });

  it("appuye_sur = numéros de soucis du même métier", () => {
    expect(soucisAppuyes({ cible: M, appuye_sur: "S1 ; S12 ; non sourcé" })).toEqual([`${M}.s01`, `${M}.s12`]);
  });

  it("douleur.tailles vide = metier.tailles_typiques", () => {
    expect(taillesDouleur({ tailles: null }, { tailles_typiques: "TPE ; PME" })).toEqual(["TPE", "PME"]);
    expect(taillesDouleur({ tailles: "ETI" }, { tailles_typiques: "TPE ; PME" })).toEqual(["ETI"]);
  });

  it("type_contenu et formats_conseilles vides = tous", () => {
    expect(typesContenu(null)).toEqual([...TYPES_CONTENU]);
    expect(typesContenu("video")).toEqual(["video"]);
    expect(formatsConseilles("", ["tableau-anime", "facecam"])).toEqual(["tableau-anime", "facecam"]);
    expect(formatsConseilles("facecam", ["tableau-anime", "facecam"])).toEqual(["facecam"]);
  });

  it("offre facultative", () => {
    const p = preparer([cibles(), sujets, cas([{ ...casOk, offre: "" }])]);
    expect(p.fichiersRefuses).toEqual([]);
    expect(p.tables.find((t) => t.table === "cas_usage")?.lignes[0].offre).toBeNull();
  });

  it("état « remplacee » = retire", () => {
    const p = preparer([cibles(), sujets, cas([{ ...casOk, etat: "remplacee" }])]);
    expect(p.tables.find((t) => t.table === "cas_usage")?.lignes[0].etat).toBe("retire");
  });

  it("linkedin-page ou linkedin_page = réseau linkedin, compte de nature page", () => {
    expect(lireReseau("linkedin-page")).toEqual({ reseau: "linkedin", nature: "page" });
    expect(lireReseau("linkedin_page")).toEqual({ reseau: "linkedin", nature: "page" });
    expect(lireReseau("linkedin")).toEqual({ reseau: "linkedin", nature: null });
  });

  it("la table compte des bases n'est pas importée", () => {
    const texte = "## table: compte\n\n| code | reseau |\n|---|---|\n| compte.instagram | instagram |\n";
    const p = preparer([{ nom: "6-reseaux.md", texte }]);
    expect(p.fichiersRefuses).toEqual([]);
    expect(p.tables).toEqual([]);
    expect(p.ignorees).toEqual(["compte"]);
  });

  it("souci_releve.force et actualite.perime_le gardés tels quels", () => {
    const p = preparer([cibles(), sujets]);
    expect(p.tables.find((t) => t.table === "souci_releve")?.lignes[0].force).toBe("faible (recoupée en partie)");
    expect(p.tables.find((t) => t.table === "actualite")?.lignes.map((l) => l.perime_le)).toEqual(["2026-10-17", null]);
  });
});
