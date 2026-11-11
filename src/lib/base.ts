/**
 * Accès à PostgreSQL par `pg` (aucun ORM). Le pool n'est ouvert qu'au premier appel : la construction
 * de l'image (`next build`) n'exige aucune base joignable.
 * `transaction(fn)` : tout ce qui passe par `requete()` pendant `fn` utilise la même connexion.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const cleGlobale = Symbol.for("usine-axion-ia.pool");
type AvecPool = typeof globalThis & { [cleGlobale]?: Pool };
const enCours = new AsyncLocalStorage<PoolClient>();

export function baseConfiguree(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function pool(): Pool {
  const g = globalThis as AvecPool;
  if (!g[cleGlobale]) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL absente : la base n'est pas configurée.");
    g[cleGlobale] = new Pool({ connectionString: url, max: 10 });
  }
  return g[cleGlobale];
}

/** Remplace le pool (essais : un schéma neuf par fichier de tests). */
export function utiliserPool(p: Pool): void {
  (globalThis as AvecPool)[cleGlobale] = p;
}

export async function requete<T extends QueryResultRow = QueryResultRow>(sql: string, valeurs: unknown[] = []): Promise<T[]> {
  const client = enCours.getStore();
  const r = client ? await client.query<T>(sql, valeurs) : await pool().query<T>(sql, valeurs);
  return r.rows;
}

export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (enCours.getStore()) return fn();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const resultat = await enCours.run(client, fn);
    await client.query("COMMIT");
    return resultat;
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}
