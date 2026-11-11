/**
 * T13 · Nouveautés : une nouveauté sans source ne peut pas être gardée ; une nouveauté périmée n'est plus proposée ;
 * garder une nouveauté la fait entrer au tirage ; l'import lit `bases/actualites/*.md` sans défaire le choix de Will.
 * Données fictives. Les essais de base exigent DATABASE_URL (PostgreSQL 16) ; sans elle, ils sont sautés.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importerBases } from "@/import/importer";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";
import { empecheDeGarder, estPerimee, lienDeLaSource } from "@/nouveautes/regles";

describe("nouveautés · règles", () => {
  it("périmée : date passée seulement ; vide = jamais périmée", () => {
    expect(estPerimee("2026-10-11", "2026-10-12")).toBe(true);
    expect(estPerimee("2026-10-12", "2026-10-12")).toBe(false);
    expect(estPerimee("", "2026-10-12")).toBe(false);
    expect(estPerimee(null, "2026-10-12")).toBe(false);
  });
  it("sans source : ne peut pas être gardée", () => {
    expect(empecheDeGarder({ source: null, perime_le: null }, "2026-10-12")).toMatch(/pas de source/);
    expect(empecheDeGarder({ source: "  ", perime_le: null }, "2026-10-12")).toMatch(/pas de source/);
    expect(empecheDeGarder({ source: "Exemple · https://example.com/a", perime_le: null }, "2026-10-12")).toBeNull();
    expect(lienDeLaSource("Exemple · https://example.com/a")).toBe("https://example.com/a");
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

const fichier = (lignes: string[]) =>
  [
    "## table: actualite",
    "",
    "| code | titre | ce_qui_change_pour_un_dirigeant | source | date_source | perime_le | retenue | etat | version | origine | valide_le |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...lignes,
    "",
  ].join("\n");
const ligne = (n: number, source: string, perime: string) =>
  `| actu.2099-01-01.${n} | Nouveauté ${n} | Ce que cela change ${n} | ${source} | 2099-01-01 | ${perime} |  | propose | 1 | propose |  |`;

describe.skipIf(!url)("nouveautés · base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'nouveautes'");
    await importerBases([
      { nom: "actualites/2099-01-01.md", texte: fichier([ligne(1, "Exemple · https://example.com/1", ""), ligne(2, "", ""), ligne(3, "Exemple · https://example.com/3", "2000-01-01")]) },
    ]);
  });
  afterAll(async () => {
    await p?.end();
  });

  it("garder une nouveauté la fait entrer au tirage ; sans source ou périmée, non", async () => {
    const { garderNouveaute, lesNouveautes, ErreurNouveaute } = await import("@/nouveautes");
    const { chargerBases } = await import("@/tirage/charger");
    const vue = await lesNouveautes();
    expect(vue.proposees.map((n) => n.code).sort()).toEqual(["actu.2099-01-01.1", "actu.2099-01-01.2"]);
    expect((await chargerBases()).actualites).toHaveLength(0);
    await expect(garderNouveaute("actu.2099-01-01.2")).rejects.toThrow(ErreurNouveaute);
    await expect(garderNouveaute("actu.2099-01-01.3")).rejects.toThrow(/périmée/);
    await garderNouveaute("actu.2099-01-01.1");
    expect((await chargerBases()).actualites.map((a) => a.code)).toEqual(["actu.2099-01-01.1"]);
    // Périmée après coup : n'entre plus au tirage.
    await p.query("UPDATE actualite SET perime_le = '2000-01-01' WHERE code = 'actu.2099-01-01.1'");
    expect((await chargerBases()).actualites).toHaveLength(0);
    await p.query("UPDATE actualite SET perime_le = NULL WHERE code = 'actu.2099-01-01.1'");
  });

  it("l'import relit les fichiers de nouveautés sans défaire le choix de Will, et n'écarte rien de lui-même", async () => {
    const { ecarterNouveaute } = await import("@/nouveautes");
    await ecarterNouveaute("actu.2099-01-01.2");
    const texte = fichier([ligne(1, "Exemple · https://example.com/1", ""), ligne(2, "", ""), ligne(3, "Exemple · https://example.com/3", "2000-01-01"), ligne(4, "Exemple · https://example.com/4", "")]);
    await importerBases([{ nom: "actualites/2099-01-01.md", texte }]);
    const r = await p.query("SELECT code, etat, retenue FROM actualite ORDER BY code");
    const par = Object.fromEntries(r.rows.map((x) => [x.code, x]));
    expect(par["actu.2099-01-01.1"]).toMatchObject({ etat: "valide", retenue: "oui" });
    expect(par["actu.2099-01-01.2"].etat).toBe("retire");
    expect(par["actu.2099-01-01.4"].etat).toBe("propose");
    // Un code déjà pris par un autre fichier : le second fichier est refusé, rien n'est retiré.
    const rapport = await importerBases([
      { nom: "actualites/2099-01-01.md", texte },
      { nom: "actualites/2099-01-08.md", texte: fichier([ligne(1, "Exemple · https://example.com/1", "")]) },
    ]);
    expect(rapport.fichiersRefuses.map((f) => f.fichier)).toEqual(["actualites/2099-01-08.md"]);
    expect((await p.query("SELECT count(*)::int AS n FROM actualite WHERE etat = 'retire'")).rows[0].n).toBe(1);
  });
});
