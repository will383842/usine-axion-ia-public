import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlafondsVideo } from "@/app/reglages/tirage/PlafondsVideo";

vi.mock("@/services/auth", () => ({ exigerSession: async () => undefined }));
vi.mock("@/reglages", () => ({
  lireReglagesTirage: async () => ({ poidsTaille: {}, poidsService: {}, plafondLotEur: 5 }),
}));

const NBSP = " ";
const nettoyer = (h: string) => h.replace(/&#x27;/g, "'");

describe("plafonds par vidéo (lecture seule)", () => {
  const html = nettoyer(renderToStaticMarkup(createElement(PlafondsVideo)));
  it("affiche les cinq montants", () => {
    expect(html).toContain("Plafonds par vidéo");
    expect(html).toContain(`1${NBSP}€ par vidéo au plus (l'Usine s'arrête si ce montant est dépassé)`);
    expect(html).toContain(`Voix refaite</span> : 0,60${NBSP}€ au plus`);
    expect(html).toContain(`0,65${NBSP}€ au plus (2 regards au plus)`);
    expect(html).toContain(`Voix du tableau de bord</span> : 1${NBSP}€ au plus`);
    expect(html).toContain(`Total par vidéo</span> : 1,25${NBSP}€ au plus`);
  });
  it("garde l'espace insécable avant € (jamais d'espace ordinaire)", () => {
    expect(html).toContain(`1${NBSP}€`);
    expect(html).not.toMatch(/\d €/);
  });
  it("affiche la phrase et aucun champ", () => {
    expect(html).toContain("Ces montants sont fixés dans le Studio. Ils sont rappelés ici pour information : rien ne se règle sur cet écran.");
    for (const balise of ["<input", "<select", "<textarea", "<button", "<form", "<fieldset"]) {
      expect(html).not.toContain(balise);
    }
  });
  it("la page affiche le bloc après le formulaire, hors du formulaire", async () => {
    const { default: Page } = await import("@/app/reglages/tirage/page");
    const page = nettoyer(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })));
    const finForm = page.indexOf("</form>");
    expect(finForm).toBeGreaterThan(-1);
    expect(page.indexOf("Plafonds par vidéo")).toBeGreaterThan(finForm);
    expect(page.slice(0, finForm)).not.toContain("Plafonds par vidéo");
    expect(page.indexOf("Enregistrer")).toBeLessThan(finForm);
  });
});
