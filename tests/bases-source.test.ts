/** L7-02 · Le dépôt source et le chemin du manifeste viennent de l'environnement : la passerelle les valide et ne les écrit pas. */
import { describe, expect, it } from "vitest";
import { cheminManifeste } from "@/passerelles/bases-source";

describe("chemin du manifeste des bases", () => {
  it("assemble dépôt et chemin donnés, sur la branche principale", () => {
    expect(cheminManifeste("proprietaire-fictif/depot-fictif", "dossier/sous-dossier/MANIFESTE.json")).toBe(
      "repos/proprietaire-fictif/depot-fictif/contents/dossier/sous-dossier/MANIFESTE.json?ref=main",
    );
  });

  it("refuse un dépôt ou un chemin mal formé ou qui sort du dossier", () => {
    for (const d of ["", "sans-barre", "a/b/c", "a b/c", "../x"]) expect(() => cheminManifeste(d, "m.json"), d).toThrow();
    for (const c of ["", "/absolu", "../m.json", "a/../m.json", "a//b", "m.json?x=1", "a b"]) expect(() => cheminManifeste("a/b", c), c).toThrow();
  });
});
