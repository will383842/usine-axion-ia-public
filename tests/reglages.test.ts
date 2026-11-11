/** T07 · Somme des parts ; un format « bientôt » jamais tiré (part nulle). */
import { describe, expect, it } from "vitest";
import { RESEAUX } from "@/contrats";
import { FORMATS_EN_SERVICE, FORMATS_PART, normaliserParts, partsDefaut, partsParReseau, verifierParts } from "@/reglages/modele";

const somme = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);

describe("parts de format par réseau", () => {
  it("la valeur de départ fait 100 % partout, tout en vidéo", () => {
    const tout = partsParReseau(null);
    for (const r of RESEAUX) {
      expect(somme(tout[r])).toBe(100);
      expect(tout[r].video).toBe(100);
    }
  });

  it("fait toujours 100, quelle que soit la valeur lue", () => {
    for (const brut of [{ video: 30, carrousel: 50 }, { video: 1, texte: 1 }, { video: -5 }, { video: "abc" }, {}, null, { video: 33.7 }]) {
      expect(somme(normaliserParts(brut, FORMATS_PART))).toBe(100);
      expect(somme(normaliserParts(brut))).toBe(100);
    }
    expect(normaliserParts({ video: 1, carrousel: 1, image: 1 }, ["video", "carrousel", "image"])).toEqual({ video: 34, carrousel: 33, image: 33, texte: 0 });
  });

  it("un format « bientôt » compte pour zéro, même s'il a une part enregistrée", () => {
    const p = normaliserParts({ video: 40, carrousel: 60, image: 10, texte: 10 });
    expect(p).toEqual({ video: 100, carrousel: 0, image: 0, texte: 0 });
    for (const f of FORMATS_PART.filter((x) => !FORMATS_EN_SERVICE.includes(x))) expect(partsDefaut()[f]).toBe(0);
  });

  it("refuse une saisie qui ne fait pas 100 ou qui donne une part à un format « bientôt »", () => {
    expect(verifierParts({ video: 100, carrousel: 0, image: 0, texte: 0 })).toBeNull();
    expect(verifierParts({ video: 90, carrousel: 0, image: 0, texte: 0 })).toMatch(/100/);
    expect(verifierParts({ video: 50, carrousel: 50, image: 0, texte: 0 })).toMatch(/pas encore en service/);
    expect(verifierParts({ video: 100.5, carrousel: 0, image: 0, texte: 0 })).not.toBeNull();
  });
});
