import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { PlafondsVideo } from "@/app/reglages/tirage/PlafondsVideo";

describe("plafonds par vidéo (lecture seule)", () => {
  const html = renderToStaticMarkup(createElement(PlafondsVideo)).replace(/&#x27;/g, "'");
  it("affiche les cinq montants", () => {
    expect(html).toContain("Plafonds par vidéo");
    expect(html).toContain("1 € par vidéo au plus (l'Usine s'arrête si ce montant est dépassé)");
    expect(html).toContain("Voix refaite</span> : 0,60 € au plus");
    expect(html).toContain("0,65 € au plus (2 regards au plus)");
    expect(html).toContain("Voix du tableau de bord</span> : 1 € au plus");
    expect(html).toContain("Total par vidéo</span> : 1,25 € au plus");
  });
  it("affiche la phrase et aucun champ", () => {
    expect(html).toContain("Ces montants sont fixés dans le Studio. Ils sont rappelés ici pour information : rien ne se règle sur cet écran.");
    expect(html).not.toContain("<input");
  });
});
