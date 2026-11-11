/** T01 · Retour après connexion : jamais vers une autre adresse (relecture de sécurité). */
import { describe, expect, it } from "vitest";
import { suiteSure } from "@/lib/suite-sure";

describe("adresse de retour après la connexion", () => {
  it("garde un chemin de l'Usine", () => {
    expect(suiteSure("/lots")).toBe("/lots");
    expect(suiteSure("/metiers?secteur=btp_immobilier#haut")).toBe("/metiers?secteur=btp_immobilier#haut");
  });

  it("refuse toute autre adresse", () => {
    for (const piege of ["//evil.example/faux", "/\evil.example", "/\t/evil.example/faux", "/\n/evil.example", "/\r/evil.example", "https://evil.example", "evil.example", "", null, undefined]) {
      const s = suiteSure(piege);
      expect(s.startsWith("/")).toBe(true);
      expect(s.startsWith("//")).toBe(false);
      expect(new URL(s, "http://usine.invalid").origin).toBe("http://usine.invalid");
    }
  });
});
