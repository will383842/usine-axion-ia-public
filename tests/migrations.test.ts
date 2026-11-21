/**
 * T01 · Migrations rejouables : sur une base neuve (un schéma neuf), jouées deux fois de suite sans erreur ni
 * changement ; les colonnes créées sont celles que lisent les dépôts de src/donnees/.
 * Exige DATABASE_URL (PostgreSQL 16) ; sans elle, ces essais sont sautés (la CI la fournit toujours).
 */
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations, listerMigrations, dossierMigrations } from "@/lib/migrations";
import { COLONNES_BASES, COLONNES_PROPRES_BASES, COLONNES_TECHNIQUES_BASES, COLONNES_USINE, type NomTableBase } from "@/donnees/schema";
import { TABLES_BASES } from "@/contrats";

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("migrations", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
  });

  afterAll(async () => {
    await p?.end();
  });

  it("joue toutes les migrations sur une base neuve, puis rien au second passage", async () => {
    const noms = await listerMigrations(dossierMigrations());
    expect(noms[0]).toBe("001-tables-v1.sql");
    const premier = await jouerMigrations(p);
    expect(premier.jouees).toEqual(noms);
    const second = await jouerMigrations(p);
    expect(second).toEqual({ jouees: [], dejaJouees: noms, modifiees: [] });
    const journal = await p.query("SELECT cible FROM journal WHERE sujet = 'migration' ORDER BY id");
    expect(journal.rows.map((r) => r.cible)).toEqual(noms);
  });

  it("rejoue le SQL de 001 lui-même sans erreur ni doublon", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(`${dossierMigrations()}/001-tables-v1.sql`, "utf8");
    await p.query(sql);
    const refus = await p.query("SELECT count(*)::int AS n FROM refus");
    expect(refus.rows[0].n).toBe(6);
  });

  it("crée les colonnes exactes des tables des bases et de l'Usine", async () => {
    const r = await p.query<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 ORDER BY table_name, ordinal_position",
      [schema],
    );
    const enBase = new Map<string, string[]>();
    for (const l of r.rows) enBase.set(l.table_name, [...(enBase.get(l.table_name) ?? []), l.column_name]);
    for (const t of Object.keys(COLONNES_BASES) as NomTableBase[]) {
      expect(enBase.get(t), t).toEqual([...COLONNES_BASES[t], ...(COLONNES_PROPRES_BASES[t] ?? []), ...COLONNES_TECHNIQUES_BASES]);
    }
    for (const [t, colonnes] of Object.entries(COLONNES_USINE)) expect(enBase.get(t), t).toEqual([...colonnes]);
    for (const t of TABLES_BASES) expect(enBase.has(t), t).toBe(true);
  });

  it("032 copie les données existantes : nouvelles tables complètes, anciennes conservées, compteur d'id repris", async () => {
    const s32 = `essai_${randomBytes(4).toString("hex")}`;
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${s32}`);
    await admin.end();
    const q = new Pool({ connectionString: url, options: `-c search_path=${s32}` });
    const racine = path.join(process.cwd(), "node_modules", ".cache");
    await mkdir(racine, { recursive: true });
    const jusqua031 = await mkdtemp(path.join(racine, "mig031-"));
    for (const nom of (await readdir(dossierMigrations())).filter((n) => n < "032")) await copyFile(path.join(dossierMigrations(), nom), path.join(jusqua031, nom));
    try {
      await jouerMigrations(q, jusqua031);
      const t1 = "2026-01-02T10:00:00.000Z";
      const t2 = "2026-01-03T11:30:00.000Z";
      await q.query(
        `INSERT INTO agregat_crm (id, jour, compte, mot, reseau, demandes, guides_envoyes, accords, mises_a_l_ecart, genere_le) VALUES
         (5, '2026-01-01', 'axion', 'guide', 'instagram', 4, 3, NULL, 5, $1),
         (9, '2026-01-02', 'axion', 'guide', 'instagram', 7, NULL, 3, NULL, $2),
         (12, '2026-01-02', 'autre', 'guide', 'linkedin', 6, 6, 6, 6, $2)`,
        [t1, t2],
      );
      await q.query(
        `INSERT INTO agregat_crm_dernier (jour, compte, genere_le) VALUES ('2026-01-01', 'axion', $1), ('2026-01-02', 'autre', $2)`,
        [t1, t2],
      );
      await q.query(
        `INSERT INTO calendrier_ligne (id, reseau, type_contenu, prevue_le, etat, note) VALUES (1, 'instagram', 'image', $1, 'programmee', 'avant 033'), (2, 'linkedin', 'texte', $2, 'brouillon', NULL)`,
        [t1, t2],
      );
      const calendrierAvant = (await q.query("SELECT id, reseau, type_contenu, prevue_le, etat, note, cree_le, modifie_le FROM calendrier_ligne ORDER BY id")).rows;
      const avant = (await q.query("SELECT id, jour::text, compte, mot, reseau, demandes, guides_envoyes, accords, mises_a_l_ecart, genere_le, recu_le FROM agregat_crm ORDER BY id")).rows;
      const dernierAvant = (await q.query("SELECT jour::text, compte, genere_le FROM agregat_crm_dernier ORDER BY jour, compte")).rows;
      expect(avant).toHaveLength(3);

      expect((await jouerMigrations(q)).jouees).toEqual(["032-agregats-reseau-cle.sql", "033-calendrier-etat-proposition.sql", "034-interrupteur-tout-arreter.sql", "035-releve-historique.sql", "036-commandes-studio.sql", "037-interrupteur-planification.sql", "038-interrupteur-plafond-ecran.sql", "039-sur-le-site.sql", "040-interrupteurs-manquants.sql", "041-interrupteur-second-code.sql", "042-second-code-courriel.sql", "043-compte-des-lignes.sql", "044-deja-fabrique-vise.sql", "045-interrupteur-comptes.sql", "046-diffuseur-neutre.sql", "047-interrupteur-semaine-carrousels.sql"]);

      // (a) mêmes nombres de lignes dans les nouvelles tables
      expect((await q.query("SELECT count(*)::int AS n FROM agregat_crm")).rows[0].n).toBe(3);
      expect((await q.query("SELECT count(*)::int AS n FROM agregat_crm_dernier")).rows[0].n).toBe(2);
      // (b) anciennes tables renommées, toujours présentes avec leurs lignes
      expect((await q.query("SELECT count(*)::int AS n FROM agregat_crm_avant_032")).rows[0].n).toBe(3);
      expect((await q.query("SELECT count(*)::int AS n FROM agregat_crm_dernier_avant_032")).rows[0].n).toBe(2);
      // (c) valeurs, genere_le et recu_le conservés
      const apres = (await q.query("SELECT id, jour::text, compte, mot, reseau, demandes, guides_envoyes, accords, mises_a_l_ecart, genere_le, recu_le FROM agregat_crm ORDER BY id")).rows;
      expect(apres).toEqual(avant);
      const dernierApres = (await q.query("SELECT jour::text, compte, genere_le FROM agregat_crm_dernier ORDER BY jour, compte")).rows;
      expect(dernierApres).toEqual(dernierAvant);
      // 033 est additive : l'ancien contenu du calendrier est conservé, les nouvelles colonnes prennent leur valeur par défaut
      const calendrierApres = (await q.query("SELECT id, reseau, type_contenu, prevue_le, etat, note, cree_le, modifie_le FROM calendrier_ligne ORDER BY id")).rows;
      expect(calendrierApres).toEqual(calendrierAvant);
      const ajoutees = (await q.query("SELECT etat_studio, etat_studio_le, date_choisie FROM calendrier_ligne ORDER BY id")).rows;
      expect(ajoutees).toEqual([
        { etat_studio: null, etat_studio_le: null, date_choisie: false },
        { etat_studio: null, etat_studio_le: null, date_choisie: false },
      ]);
      // (d) le compteur d'id repart après le plus grand id existant
      const nouveau = await q.query(
        `INSERT INTO agregat_crm (jour, compte, mot, reseau, demandes, genere_le) VALUES ('2026-01-04', 'axion', 'guide', 'linkedin', 3, $1) RETURNING id`,
        [t2],
      );
      expect(Number(nouveau.rows[0].id)).toBeGreaterThan(12);
      // un même jour et un même compte sur deux réseaux cohabitent désormais
      await q.query(
        `INSERT INTO agregat_crm (jour, compte, mot, reseau, demandes, genere_le) VALUES ('2026-01-02', 'axion', 'guide', 'linkedin', 3, $1)`,
        [t2],
      );
    } finally {
      await q.end();
    }
  });
});
