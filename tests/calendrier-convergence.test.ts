/** L7-24 · Convergence du calendrier vers le Studio : aucun doublon, états du Studio à part, date choisie intouchable (données fictives, aucun appel réel). */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("calendrier · convergence vers le Studio", () => {
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

  const ligne = async () =>
    (await p.query(`INSERT INTO calendrier_ligne (reseau, type_contenu, prevue_le) VALUES ('instagram', 'video', now() + interval '10 days') RETURNING id::text`)).rows[0].id as string;
  const lire = async (id: string) => (await p.query("SELECT prevue_le, etat, etat_studio, date_choisie FROM calendrier_ligne WHERE id = $1", [id])).rows[0];

  it("l'état lu du Studio va dans sa propre colonne et ne touche ni l'état de l'usine ni la date", async () => {
    const { noterEtatStudio } = await import("@/calendrier");
    const id = await ligne();
    const avant = await lire(id);
    await noterEtatStudio(id, "programmee");
    const apres = await lire(id);
    expect(apres.etat_studio).toBe("programmee");
    expect(apres.etat).toBe(avant.etat);
    expect(apres.prevue_le).toEqual(avant.prevue_le);
  });

  it("refuse un état inconnu du Studio", async () => {
    const { noterEtatStudio } = await import("@/calendrier");
    await expect(noterEtatStudio(await ligne(), "n-importe-quoi")).rejects.toThrow();
  });

  it("la date par défaut ne remplace jamais une date choisie par le fondateur", async () => {
    const { changerLeJour, proposerLaDateParDefaut } = await import("@/calendrier");
    const jour = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const id = await ligne();
    await changerLeJour(id, jour(20));
    const choisie = await lire(id);
    expect(choisie.date_choisie).toBe(true);
    expect(await proposerLaDateParDefaut(id, jour(3))).toBe(false);
    expect((await lire(id)).prevue_le).toEqual(choisie.prevue_le);
    const libre = await ligne();
    expect(await proposerLaDateParDefaut(libre, jour(3))).toBe(true);
  });

  it("à la relance, aucun doublon : une seule ligne par contenu et par réseau", async () => {
    const { placerLesNouveaux } = await import("@/calendrier");
    await placerLesNouveaux();
    await placerLesNouveaux();
    const d = await p.query(`SELECT lot_ligne, reseau, count(*) FROM calendrier_ligne WHERE lot_ligne IS NOT NULL AND archive_le IS NULL GROUP BY 1, 2 HAVING count(*) > 1`);
    expect(d.rows).toHaveLength(0);
    // L'index unique tient même si deux envois se croisent.
    const ex = await p.query("SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'calendrier_ligne' AND indexname = 'calendrier_ligne_unique_contenu'");
    expect(ex.rows).toHaveLength(1);
  });
});
