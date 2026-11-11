/**
 * Exécuteur de migrations, joué au démarrage du serveur (jamais à la construction de l'image).
 * Fichiers `migrations/NNN-*.sql`, joués une fois chacun, dans l'ordre, chacun dans sa transaction,
 * notés dans la table `migration` et dans le `journal`. Un verrou empêche deux serveurs de jouer en même temps.
 * Aucune migration ne supprime : retirer = `etat = 'retire'` ou `archive_le` (contrôle de la CI).
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

export const MOTIF_MIGRATION = /^(\d{3})-[a-z0-9-]+\.sql$/;
const VERROU = 7_301_001;

export interface ResultatMigrations {
  jouees: string[];
  dejaJouees: string[];
  /** Migrations déjà jouées dont le fichier a changé depuis (signalé, jamais rejoué). */
  modifiees: string[];
}

export function dossierMigrations(): string {
  return path.join(process.cwd(), "migrations");
}

export async function listerMigrations(dossier: string): Promise<string[]> {
  const noms = (await readdir(dossier)).filter((n) => MOTIF_MIGRATION.test(n)).sort();
  const numeros = noms.map((n) => n.slice(0, 3));
  const double = numeros.find((n, i) => numeros.indexOf(n) !== i);
  if (double) throw new Error(`Deux migrations portent le numéro ${double}.`);
  return noms;
}

function empreinte(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export async function jouerMigrations(p: Pool, dossier = dossierMigrations()): Promise<ResultatMigrations> {
  const noms = await listerMigrations(dossier);
  const client = await p.connect();
  const resultat: ResultatMigrations = { jouees: [], dejaJouees: [], modifiees: [] };
  try {
    await client.query("SELECT pg_advisory_lock($1)", [VERROU]);
    await client.query(`CREATE TABLE IF NOT EXISTS migration (
      nom text PRIMARY KEY,
      empreinte text NOT NULL,
      jouee_le timestamptz NOT NULL DEFAULT now()
    )`);
    const deja = new Map((await client.query<{ nom: string; empreinte: string }>("SELECT nom, empreinte FROM migration")).rows.map((r) => [r.nom, r.empreinte]));
    for (const nom of noms) {
      const sql = await readFile(path.join(dossier, nom), "utf8");
      const e = empreinte(sql);
      const ancienne = deja.get(nom);
      if (ancienne) {
        resultat.dejaJouees.push(nom);
        if (ancienne !== e) resultat.modifiees.push(nom);
        continue;
      }
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO migration (nom, empreinte) VALUES ($1, $2)", [nom, e]);
        const journal = await client.query<{ existe: string | null }>("SELECT to_regclass('journal')::text AS existe");
        if (journal.rows[0]?.existe) {
          await client.query("INSERT INTO journal (sujet, cible, message) VALUES ('migration', $1, $2)", [nom, `Migration ${nom} jouée.`]);
        }
        await client.query("COMMIT");
        resultat.jouees.push(nom);
      } catch (erreur) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${nom} refusée : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    }
    return resultat;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [VERROU]).catch(() => undefined);
    client.release();
  }
}
