/** RC-13 · Suivi des campagnes et des cases : règles pures, données fictives, aucun appel. */
import { describe, expect, it } from "vitest";
import { NON_DISPONIBLE, afficherNombre, afficherPart, suivreCampagne, type CaseSuivie } from "@/avancement/suivi";
import type { Campagne } from "@/campagnes/regles";

const campagne: Campagne = { reseau: "instagram", mode: "aleatoire", parJour: 2, debut: "2024-01-01", dureeJours: 10, pause: false, graine: 1 };
const cases: CaseSuivie[] = [
  { jour: "2024-01-01", reseau: "instagram", publiee: true },
  { jour: "2024-01-02", reseau: "instagram", publiee: true },
  { jour: "2024-01-03", reseau: "instagram", publiee: false },
  { jour: "2024-01-04", reseau: "instagram", publiee: null },
  { jour: "2024-01-02", reseau: "facebook", publiee: true },
  { jour: "2024-02-01", reseau: "instagram", publiee: true },
];

describe("suivi des campagnes · données présentes", () => {
  it("compte les cases de la campagne (réseau et durée) et la part publiée connue", () => {
    const s = suivreCampagne(campagne, cases);
    expect(s.cases).toBe(4);
    expect(s.publiees).toBe(2);
    expect(s.partPubliee).toBe(67);
    expect(s.partInconnues).toBe(1);
  });
  it("0 case sur une lecture réussie est bien 0, mais la part reste non disponible", () => {
    const s = suivreCampagne(campagne, []);
    expect(s.cases).toBe(0);
    expect(s.publiees).toBeNull();
    expect(s.partPubliee).toBeNull();
    expect(afficherNombre(s.cases)).toBe("0");
    expect(afficherPart(s.partPubliee)).toBe(NON_DISPONIBLE);
  });
});

describe("suivi des campagnes · donnée absente", () => {
  it("sans lecture du calendrier : « non disponible », jamais 0", () => {
    for (const absent of [null, undefined]) {
      const s = suivreCampagne(campagne, absent);
      expect(s.cases).toBeNull();
      expect(s.publiees).toBeNull();
      expect(s.partPubliee).toBeNull();
      expect(afficherNombre(s.cases)).toBe("non disponible");
      expect(afficherNombre(s.publiees)).toBe("non disponible");
      expect(afficherPart(s.partPubliee)).toBe("non disponible");
    }
  });
  it("aucune case dont l'état est connu : part non disponible, pas 0 %", () => {
    const s = suivreCampagne(campagne, [{ jour: "2024-01-02", reseau: "instagram", publiee: null }]);
    expect(s.cases).toBe(1);
    expect(s.publiees).toBeNull();
    expect(s.partPubliee).toBeNull();
    expect(afficherPart(s.partPubliee)).toBe("non disponible");
  });
  it("NaN et nombres invalides s'affichent « non disponible »", () => {
    expect(afficherNombre(Number.NaN)).toBe("non disponible");
    expect(afficherPart(Number.NaN)).toBe("non disponible");
    expect(afficherPart(50)).toBe("50 %");
  });
});

describe("suivi des campagnes · données illisibles", () => {
  it("campagne invalide (premier jour illisible) : tout est non disponible, jamais 0", () => {
    const s = suivreCampagne({ ...campagne, debut: "pas-une-date" }, cases);
    expect(s).toEqual({ cases: null, publiees: null, partInconnues: null, partPubliee: null });
    expect(afficherNombre(s.cases)).toBe(NON_DISPONIBLE);
    expect(afficherNombre(s.partInconnues)).toBe(NON_DISPONIBLE);
  });
  it("case au jour illisible : comptée comme inconnue, elle ne disparaît pas", () => {
    const s = suivreCampagne(campagne, [{ jour: "2024-01-xx", reseau: "instagram", publiee: true }]);
    expect(s.cases).toBe(1);
    expect(s.partInconnues).toBe(1);
    expect(s.publiees).toBeNull();
    expect(afficherPart(s.partPubliee)).toBe(NON_DISPONIBLE);
    const t = suivreCampagne(campagne, [...cases, { jour: "2024-01-xx", reseau: "instagram", publiee: true }]);
    expect(t.cases).toBe(5);
    expect(t.partInconnues).toBe(2);
  });
  it("case au jour inexistant (2024-02-31, 2024-02-30) : comptée une fois, comme inconnue", () => {
    const c = { ...campagne, debut: "2024-02-01", dureeJours: 29 };
    for (const jour of ["2024-02-31", "2024-02-30"]) {
      const s = suivreCampagne(c, [{ jour, reseau: "instagram", publiee: true }]);
      expect(s.cases).toBe(1);
      expect(s.partInconnues).toBe(1);
      expect(s.publiees).toBeNull();
    }
  });
});
