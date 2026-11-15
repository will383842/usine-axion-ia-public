/** RC-12 · Campagnes (deux modes) : règles pures, aucune base, aucun envoi, données fictives. */
import { describe, expect, it } from "vitest";
import { proposerDuJour, verifierCampagne, type Campagne } from "@/campagnes/regles";

const candidats = Array.from({ length: 12 }, (_, i) => `C${i + 1}`);
const base: Campagne = { reseau: "instagram", mode: "aleatoire", parJour: 2, debut: "2024-01-01", dureeJours: 14, pause: false, graine: 7 };

describe("campagnes · pause et durée", () => {
  it("une campagne en pause ne propose rien", () => {
    expect(proposerDuJour({ ...base, pause: true }, "2024-01-02", candidats)).toEqual([]);
    expect(proposerDuJour({ ...base, mode: "parametre", jours: [1, 2, 3, 4, 5], pause: true }, "2024-01-02", candidats)).toEqual([]);
  });
  it("ne propose rien hors de la durée", () => {
    expect(proposerDuJour(base, "2023-12-31", candidats)).toEqual([]);
    expect(proposerDuJour(base, "2024-01-15", candidats)).toEqual([]);
    expect(proposerDuJour(base, "2024-01-14", candidats)).toHaveLength(2);
  });
});

describe("campagnes · mode aléatoire", () => {
  it("le tirage est identique à graine égale, et change avec la graine", () => {
    const a = proposerDuJour(base, "2024-01-03", candidats);
    expect(proposerDuJour(base, "2024-01-03", candidats)).toEqual(a);
    expect(new Set(a).size).toBe(2);
    const autres = [1, 2, 3, 4, 5, 6].map((g) => proposerDuJour({ ...base, graine: g }, "2024-01-03", candidats).join());
    expect(new Set(autres).size).toBeGreaterThan(1);
  });
  it("ne propose jamais plus que les candidats", () => {
    expect(proposerDuJour({ ...base, parJour: 4 }, "2024-01-03", ["C1", "C2"])).toHaveLength(2);
  });
});

describe("campagnes · mode paramétré", () => {
  const p: Campagne = { ...base, mode: "parametre", jours: [1, 3] }; // lundi, mercredi ; 2024-01-01 est un lundi
  it("propose les premiers candidats, seulement les jours choisis", () => {
    expect(proposerDuJour(p, "2024-01-01", candidats)).toEqual(["C1", "C2"]);
    expect(proposerDuJour(p, "2024-01-02", candidats)).toEqual([]);
    expect(proposerDuJour(p, "2024-01-03", candidats)).toEqual(["C1", "C2"]);
  });
});

describe("campagnes · vérification", () => {
  it("refuse ce qui dépasse le rythme maximal par semaine ou une durée vide", () => {
    expect(verifierCampagne(base)).toBeNull();
    expect(verifierCampagne({ ...base, parJour: 5 })).not.toBeNull();
    expect(verifierCampagne({ ...base, dureeJours: 0 })).not.toBeNull();
    expect(verifierCampagne({ ...base, mode: "parametre", jours: [] })).not.toBeNull();
    expect(verifierCampagne({ ...base, debut: "demain" })).not.toBeNull();
  });
});
