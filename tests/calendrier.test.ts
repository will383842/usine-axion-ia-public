/** T11 · Un lot commandé apparaît réparti selon les rythmes (règles pures, données fictives). */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("calendrier · aucune écriture au GET", () => {
  it("la page /calendrier n'appelle pas placerLesNouveaux ; seule une action explicite le fait", () => {
    const page = readFileSync("src/app/calendrier/page.tsx", "utf8");
    expect(page).not.toMatch(/placerLesNouveaux/);
    const actions = readFileSync("src/app/calendrier/actions.ts", "utf8");
    expect(actions).toMatch(/placerLesNouveaux/);
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("calendrier · changerLeJour en base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'calendrier'");
  });
  afterAll(async () => {
    await p?.end();
  });

  const jourDans = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  it("refuse un jour passé avec un message clair, sans rien modifier", async () => {
    const { changerLeJour, ErreurCalendrier } = await import("@/calendrier");
    const [{ id }] = (await p.query(`INSERT INTO calendrier_ligne (reseau, type_contenu, prevue_le) VALUES ('instagram', 'video', now() + interval '3 days') RETURNING id::text`)).rows;
    const avant = (await p.query("SELECT prevue_le, modifie_le FROM calendrier_ligne WHERE id = $1", [id])).rows[0];
    await expect(changerLeJour(id, jourDans(-2))).rejects.toThrow(ErreurCalendrier);
    await expect(changerLeJour(id, jourDans(-2))).rejects.toThrow(/passé/);
    const apres = (await p.query("SELECT prevue_le, modifie_le FROM calendrier_ligne WHERE id = $1", [id])).rows[0];
    expect(apres).toEqual(avant);
  });

  it("accepte un jour à venir", async () => {
    const { changerLeJour } = await import("@/calendrier");
    const [{ id }] = (await p.query(`INSERT INTO calendrier_ligne (reseau, type_contenu, prevue_le) VALUES ('instagram', 'video', now() + interval '3 days') RETURNING id::text`)).rows;
    await changerLeJour(id, jourDans(5));
    const r = (await p.query("SELECT to_char(prevue_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS j FROM calendrier_ligne WHERE id = $1", [id])).rows[0];
    expect(r.j).toBe(jourDans(5));
  });
});
