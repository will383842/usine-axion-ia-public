/**
 * U-REPRISE · les commandes en cours sont retrouvées dans le même état sur une base d'essai « restaurée ». Aucun appel réel.
 * Limite assumée : la restauration est simulée par recopie des lignes entre deux schémas d'essai (pas de pg_dump : `node:child_process`
 * est refusé aux essais par la garde). Le script réel de sauvegarde/restauration relève de L7-04 (tests/sauvegarde.test.ts).
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const appelerStudio = vi.fn();
vi.mock("@/passerelles/studio", () => ({ appelerStudio: (...a: unknown[]) => appelerStudio(...a) }));

const url = process.env.DATABASE_URL;
const source = `essai_${randomBytes(4).toString("hex")}`;
const restauree = `essai_${randomBytes(4).toString("hex")}`;
let admin: Pool;
let pSource: Pool;
let pRestauree: Pool;

const ETATS = ["a_envoyer", "envoyee", "mise_de_cote_studio", "non_envoyee"] as const;
const TABLES = ["compte", "calendrier_ligne", "commande_studio"] as const;

describe.skipIf(!url)("restauration · les commandes en cours sont retrouvées", () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${source}`);
    await admin.query(`CREATE SCHEMA ${restauree}`);
    pSource = new Pool({ connectionString: url, options: `-c search_path=${source}` });
    pRestauree = new Pool({ connectionString: url, options: `-c search_path=${restauree}` });
    const { jouerMigrations } = await import("@/lib/migrations");
    await jouerMigrations(pSource);
    await jouerMigrations(pRestauree);
  });
  afterAll(async () => {
    await pSource?.end();
    await pRestauree?.end();
    await admin?.end();
  });

  it("les quatre états de commande se retrouvent à l'identique, et la reprise ne double rien", async () => {
    await pSource.query(`INSERT INTO compte (code, reseau, identifiant, nature, nom) VALUES ('linkedin:compte-fictif-1', 'linkedin', 'compte-fictif-1', 'page', 'Compte fictif')`);
    const { cleCommande } = await import("@/commandes/regles");
    for (const etat of ETATS) {
      const l = await pSource.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le) VALUES ('linkedin', 'linkedin:compte-fictif-1', 'video', '2099-12-10T08:30:00Z') RETURNING id::text`);
      await pSource.query(
        `INSERT INTO commande_studio (cle, calendrier_ligne, reseau, compte, type_contenu, jour, instant, etat_envoi, modifie_le)
         VALUES ($1, $2, 'linkedin', 'linkedin:compte-fictif-1', 'video', '2099-12-10', '2099-12-10T08:30:00Z', $3, now() - interval '1 hour')`,
        [cleCommande(l.rows[0].id), l.rows[0].id, etat],
      );
    }

    // « Sauvegarde » puis « restauration » : les lignes lues dans la source sont rejouées telles quelles dans la base d'essai.
    for (const table of TABLES) {
      const { rows } = await pSource.query(`SELECT * FROM ${table}`);
      for (const ligne of rows) {
        const colonnes = Object.keys(ligne);
        await pRestauree.query(`INSERT INTO ${table} (${colonnes.join(", ")}) VALUES (${colonnes.map((_, i) => `$${i + 1}`).join(", ")})`, colonnes.map((c) => ligne[c]));
      }
    }
    const lire = async (pool: Pool) => (await pool.query(`SELECT cle, calendrier_ligne::text, etat_envoi, etat_studio, jour::text FROM commande_studio ORDER BY cle`)).rows;
    expect(await lire(pRestauree)).toEqual(await lire(pSource));
    expect((await lire(pRestauree)).map((r) => r.etat_envoi).sort()).toEqual([...ETATS].sort());

    // Sur la base restaurée, la reprise ne touche que ce qui n'était pas parti, une seule fois.
    const { utiliserPool } = await import("@/lib/base");
    utiliserPool(pRestauree);
    await pRestauree.query(`UPDATE interrupteur SET allume = true WHERE code = 'commandes.studio'`);
    appelerStudio.mockResolvedValue({ envoye: true, statut: 201, corps: { etat: "recue", deja: false } });
    const { reprendreInterrompues } = await import("@/commandes/reprise");
    await reprendreInterrompues();
    await reprendreInterrompues();
    expect(appelerStudio).toHaveBeenCalledTimes(1);
    const apres = await lire(pRestauree);
    expect(apres.filter((r) => r.etat_envoi === "envoyee")).toHaveLength(2);
    expect(apres.filter((r) => r.etat_envoi === "mise_de_cote_studio")).toHaveLength(1);
    expect(apres.filter((r) => r.etat_envoi === "non_envoyee")).toHaveLength(1);
    expect(apres).toHaveLength(4);
  });
});
