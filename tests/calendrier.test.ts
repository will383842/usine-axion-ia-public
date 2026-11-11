/** T11 · Un lot commandé apparaît réparti selon les rythmes (règles pures, données fictives). */
import { describe, expect, it } from "vitest";
import { repartir, trous } from "@/calendrier/regles";
import { RYTHMES_DEFAUT, type RythmesParReseau } from "@/reglages/modele";

const rythmes = (surcharge: Partial<RythmesParReseau> = {}): RythmesParReseau => ({ ...RYTHMES_DEFAUT, ...surcharge });
const lignes = (n: number, reseau: "instagram" | "linkedin" = "instagram") => Array.from({ length: n }, (_, i) => ({ ligne: `L1-${i + 1}`, reseau }));

describe("calendrier · répartition selon les rythmes", () => {
  it("n'en met pas plus par semaine que le rythme et étale sur les semaines", () => {
    // Instagram 5 à 7 : 6 par semaine ; 2024-01-01 est un lundi.
    const { placements } = repartir(lignes(8), rythmes(), {}, "2024-01-01");
    const semaine1 = placements.filter((p) => p.jour < "2024-01-08");
    expect(semaine1).toHaveLength(6);
    expect(placements.filter((p) => p.jour >= "2024-01-08")).toHaveLength(2);
    expect(new Set(semaine1.map((p) => p.jour)).size).toBe(6);
  });

  it("ne place rien avant la date de départ et tient compte de ce qui est déjà prévu", () => {
    const { placements } = repartir(lignes(3, "linkedin"), rythmes(), { linkedin: { "2024-01-01": 3 } }, "2024-01-03");
    expect(placements.every((p) => p.jour >= "2024-01-08")).toBe(true);
  });

  it("un réseau au repos n'est pas placé", () => {
    const { placements, sansPlace } = repartir(lignes(2), rythmes({ instagram: { min: 0, max: 0 } }), {}, "2024-01-01");
    expect(placements).toHaveLength(0);
    expect(sansPlace).toHaveLength(2);
  });

  it("signale un trou quand le minimum n'est pas atteint", () => {
    const t = trous(rythmes(), { instagram: { "2024-01-01": 3 }, facebook: { "2024-01-01": 5 } }, ["2024-01-01"]);
    expect(t.find((x) => x.reseau === "instagram")?.manque).toBe(2);
    expect(t.find((x) => x.reseau === "facebook")).toBeUndefined();
  });
});
