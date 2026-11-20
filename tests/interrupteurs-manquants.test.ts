/**
 * U-INTERRUPTEURS-MANQUANTS · la migration 040 crée, éteints, les interrupteurs que le code lit déjà ;
 * base neuve et base déjà migrée ; rejouer ne change rien ; une ligne existante n'est jamais modifiée.
 * Exige DATABASE_URL (PostgreSQL 16) ; sans elle, ces essais sont sautés (la CI la fournit toujours).
 */
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { dossierMigrations, jouerMigrations } from "@/lib/migrations";

const url = process.env.DATABASE_URL;
const CODES = ["horloge.semaine", "journal", "studio.sortant"];
const pools: Pool[] = [];

async function baseNeuve(): Promise<Pool> {
  const schema = `essai_${randomBytes(4).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  pools.push(p);
  return p;
}
const lire = async (p: Pool) => (await p.query(`SELECT code, nom, description, allume, cree_le, modifie_le, archive_le FROM interrupteur ORDER BY code`)).rows;

describe.skipIf(!url)("migration 040 · interrupteurs manquants", () => {
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
  });

  it("base neuve : les trois interrupteurs existent, éteints ; rejouer ne change rien", async () => {
    const p = await baseNeuve();
    await jouerMigrations(p);
    const avant = await lire(p);
    for (const code of CODES) expect(avant.find((l) => l.code === code), code).toMatchObject({ allume: false, archive_le: null });
    expect((await jouerMigrations(p)).jouees).toEqual([]);
    await p.query(await readFile(path.join(dossierMigrations(), "040-interrupteurs-manquants.sql"), "utf8"));
    expect(await lire(p)).toEqual(avant);
  });

  it("base déjà migrée jusqu'à 039 : la 040 crée les absents éteints et ne touche à aucune ligne existante", async () => {
    const p = await baseNeuve();
    const racine = path.join(process.cwd(), "node_modules", ".cache");
    await mkdir(racine, { recursive: true });
    const jusqua039 = await mkdtemp(path.join(racine, "mig039-"));
    for (const nom of (await readdir(dossierMigrations())).filter((n) => n < "040")) await copyFile(path.join(dossierMigrations(), nom), path.join(jusqua039, nom));
    await jouerMigrations(p, jusqua039);
    for (const code of CODES) expect((await p.query(`SELECT 1 FROM interrupteur WHERE code = $1`, [code])).rowCount).toBe(0);
    // Un interrupteur posé et allumé par le fondateur avant la 040 : il reste tel quel.
    await p.query(`INSERT INTO interrupteur (code, nom, description, allume) VALUES ('journal', 'Journal posé à la main', 'Posé avant.', true)`);
    const autres = (await lire(p)).filter((l) => !CODES.includes(l.code));
    const posee = (await lire(p)).find((l) => l.code === "journal");

    expect((await jouerMigrations(p)).jouees).toEqual(["040-interrupteurs-manquants.sql"]);
    const apres = await lire(p);
    expect(apres.filter((l) => !CODES.includes(l.code))).toEqual(autres);
    expect(apres.find((l) => l.code === "journal")).toEqual(posee);
    for (const code of ["horloge.semaine", "studio.sortant"]) expect(apres.find((l) => l.code === code), code).toMatchObject({ allume: false });
    expect((await jouerMigrations(p)).jouees).toEqual([]);
    expect(await lire(p)).toEqual(apres);
  });
});
