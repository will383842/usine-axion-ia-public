/**
 * CPT-C · la fiche d'un métier montre TOUS ses cas d'usage (titre, problème, source, état) et l'état de chaque douleur,
 * en lecture seule : aucun bouton de plus, aucune écriture. Données fictives, aucune base.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const ecrit = vi.fn();
vi.mock("@/services/auth", () => ({ exigerSession: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
vi.mock("@/components/gabarit/EcranEteint", () => ({ EcranEteint: () => null }));
vi.mock("@/app/metiers/Boutons", () => ({ BoutonMetier: () => createElement("button", null, "Allumer"), BoutonValider: () => createElement("button", null, "Valider ce métier") }));
vi.mock("@/lib/base", () => ({ requete: vi.fn(async () => []) }));

const cas = (code: string, o: object = {}) => ({ code, cible: "essai.metier", service: "svc", titre: `Titre ${code}`, probleme: `Problème ${code}`, source: null, phare: null, calcule: null, etat: "propose", ...o });
const metier = { code: "essai.metier", nom: "Métier d'essai", secteur: "essai", allume: true, etat: "propose", profondeur: "complete", calcule: null, mots: null, se_nomment: null };
const lignesCas = [
  cas("c1", { source: "Source fictive" }),
  cas("c2", { phare: "2", titre: "Cas phare fictif", etat: "valide" }),
  cas("c3"),
  cas("c4", { etat: "retire", probleme: null }),
  cas("c5"),
];
const douleurs = [
  { code: "d1", cible: "essai.metier", dite: "Douleur à valider", services: "svc", calcule: null, etat: "propose" },
  { code: "d2", cible: "essai.metier", dite: "Douleur validée", services: "", calcule: null, etat: "valide" },
];
vi.mock("@/donnees", () => ({
  interrupteurAllume: vi.fn(async () => true),
  depots: {
    metier: { lire: vi.fn(async () => metier), modifier: ecrit },
    douleur: { lister: vi.fn(async () => douleurs), modifier: ecrit },
    cas_usage: { lister: vi.fn(async () => lignesCas), modifier: ecrit },
    service: { lister: vi.fn(async () => [{ code: "svc", nom: "Service fictif" }]) },
    secteur: { lire: vi.fn(async () => ({ code: "essai", nom: "Secteur fictif" })) },
  },
}));

async function html(): Promise<string> {
  const { default: Page } = await import("../src/app/metiers/[code]/page");
  return renderToStaticMarkup((await Page({ params: Promise.resolve({ code: "essai.metier" }) })) as ReactElement);
}

describe("fiche d'un métier : tout ce qu'on valide se lit", () => {
  it("liste tous les cas, pas seulement les phares, avec titre, problème, source et état", async () => {
    const h = await html();
    expect(h).toContain("Ses cas d&#x27;usage (5)");
    for (const c of lignesCas) expect(h).toContain(c.titre);
    for (const c of lignesCas.filter((x) => x.probleme)) expect(h).toContain(c.probleme as string);
    expect(h).toContain("Source : Source fictive");
    expect(h).toContain("Problème non renseigné");
    expect(h).toContain("Validé · Cas phare");
    expect(h).toContain("Retiré");
    expect(h.match(/À valider/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("le cas phare vient en premier", async () => {
    const h = await html();
    expect(h.indexOf("Cas phare fictif")).toBeLessThan(h.indexOf("Titre c1"));
  });

  it("chaque douleur montre son état", async () => {
    const h = await html();
    const bloc = h.slice(h.indexOf("Ses douleurs"), h.indexOf("Ses cas d&#x27;usage"));
    expect(bloc).toContain("Douleur à valider");
    expect(bloc).toContain("À valider");
    expect(bloc).toContain("Douleur validée");
    expect(bloc).toContain("Validé");
  });

  it("lecture seule : pas de formulaire ni de champ, aucune écriture, seulement les deux boutons d'avant", async () => {
    const h = await html();
    expect(h).not.toMatch(/<form|<input|<textarea/);
    expect((h.match(/<button/g) ?? []).length).toBe(2);
    expect(ecrit).not.toHaveBeenCalled();
  });
});
