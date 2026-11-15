/** UO-07 · Chaque saisie ou correction ajoute une ligne à l'historique ; la valeur précédente n'est jamais perdue ; la lecture n'écrit rien. Données fictives. Exige DATABASE_URL (PostgreSQL 16). */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("historique des relevés · base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'chiffres'");
    await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom) VALUES ('instagram:essai', 'instagram', 'essai', 'profil', 'Essai') ON CONFLICT DO NOTHING");
    await p.query("INSERT INTO mot (code, mot) VALUES ('mot-essai', 'ESSAI')");
  });
  afterAll(async () => {
    await p?.end();
  });

  it("deux saisies de la même semaine donnent deux lignes ; la première valeur reste lisible", async () => {
    const { enregistrerReleve, historiqueDesReleves } = await import("@/chiffres");
    const base = { semaine: "2026-10-12", mot: "mot-essai", compte: "instagram:essai", commentaires: 5, messages: 4, abonnesGagnes: 2 };
    await enregistrerReleve({ ...base, demandesGuide: 1 });
    await enregistrerReleve({ ...base, demandesGuide: 7 });
    expect((await p.query("SELECT count(*)::int AS n FROM releve_mot")).rows[0].n).toBe(1);
    expect((await p.query("SELECT count(*)::int AS n FROM releve_mot_historique")).rows[0].n).toBe(2);
    expect((await p.query("SELECT demandes_guide FROM releve_mot_historique ORDER BY id")).rows.map((r) => r.demandes_guide)).toEqual([1, 7]);

    const avant = (await p.query("SELECT count(*)::int AS n FROM releve_mot_historique")).rows[0].n;
    const groupes = await historiqueDesReleves();
    expect(groupes).toHaveLength(1);
    expect(groupes[0]).toMatchObject({ mot: "mot-essai", compte: "instagram:essai" });
    expect(groupes[0].lignes.map((l) => l.demandes_guide)).toEqual([7, 1]);
    expect((await p.query("SELECT count(*)::int AS n FROM releve_mot_historique")).rows[0].n).toBe(avant);
  });

  it("la migration pose l'interrupteur « reservations » éteint", async () => {
    expect((await p.query("SELECT allume FROM interrupteur WHERE code = 'reservations'")).rows[0].allume).toBe(false);
  });
});
