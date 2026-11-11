/**
 * Import des bases (CONTRATS-ECHANGE.md § 2) : `bases/*.md` → tables des bases de l'Usine.
 * - une seule transaction (un import à la fois) ; un fichier refusé n'écrit rien, les autres passent ;
 * - mise à jour par `code`, ligne nouvelle ajoutée, ligne disparue passée en `retire` ; jamais de suppression ;
 * - écritures groupées (une requête par paquet de lignes) ; une ligne identique n'est pas réécrite :
 *   rejouer l'import ne change rien ;
 * - une ligne `valide` en base garde son `etat` et son `valide_le` (une validation de Will n'est jamais défaite) ;
 * - chaque ligne mise à jour est notée au journal : son code et les colonnes changées (pas les valeurs) ;
 * - `metier.allume` (l'interrupteur de Will) n'est jamais écrit ; la table `compte` des bases n'est pas importée ;
 * - lignes de départ de `service` et `compte` ajoutées si elles manquent.
 */
import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { journaliser } from "@/donnees";
import { COLONNES_BASES, type NomTableBase } from "@/donnees/schema";
import { requete, transaction } from "@/lib/base";
import { COMPTES_DEPART, SERVICES_DEPART, SOURCE_COMPTES, SOURCE_SERVICES } from "./depart";
import { DOSSIER_ACTUALITES, preparer, TABLES_RENVOYEES, type FichierBase, type FichierRefuse, type LigneBase, type LigneRefusee, type TablePreparee } from "./preparation";

export const FICHIER_BASE = /^\d-[a-z0-9-]+\.md$/;
const PAQUET = 1000;
const VERROU_IMPORT = 7_301_002;
const MAX_LIGNES_REFUSEES_JOURNAL = 200;

export interface ComptesTable {
  table: string;
  fichier: string;
  lues: number;
  ajoutees: number;
  mises_a_jour: number;
  retirees: number;
  refusees: number;
}

export interface RapportImport {
  le: string;
  fichiers: string[];
  tables: ComptesTable[];
  fichiersRefuses: FichierRefuse[];
  lignesRefusees: LigneRefusee[];
  /** Tables des bases lues mais non importées (`compte`). */
  ignorees: string[];
  depart: { service: number; compte: number };
}

export function dossierBases(): string {
  return path.join(process.cwd(), "bases");
}

/** Fichiers de nouveautés déposés chaque semaine : `bases/actualites/AAAA-MM-JJ.md` (le dossier peut manquer). */
export const FICHIER_ACTUALITES = /^[a-z0-9][a-z0-9._-]*\.md$/;

export async function lireFichiersBases(dossier = dossierBases()): Promise<FichierBase[]> {
  const noms = (await readdir(dossier)).filter((n) => FICHIER_BASE.test(n)).sort();
  const sous = path.join(dossier, DOSSIER_ACTUALITES);
  const actus = (await readdir(sous).catch(() => [] as string[])).filter((n) => FICHIER_ACTUALITES.test(n) && n !== "lisez-moi.md").sort();
  const lire = (nom: string, chemin: string) => readFile(chemin, "utf8").then((texte) => ({ nom, texte }));
  return Promise.all([...noms.map((n) => lire(n, path.join(dossier, n))), ...actus.map((n) => lire(`${DOSSIER_ACTUALITES}${n}`, path.join(sous, n)))]);
}

/** Colonnes qu'une validation de Will fixe : une ligne `valide` en base les garde, quoi que dise le fichier. */
const COLONNES_VALIDATION = new Set(["etat", "valide_le"]);
/** Nouveautés : le choix de Will (garder = `valide` + `retenue`, écarter = `retire`) n'est jamais défait par un fichier. */
const COLONNES_CHOIX_NOUVEAUTE = new Set(["etat", "valide_le", "retenue"]);

export interface LigneMiseAJour {
  code: string;
  colonnes: string[];
}

/**
 * Ajoute ou met à jour un paquet de lignes (les lignes identiques ne bougent pas). Une ligne déjà `valide` en base
 * garde son `etat` et son `valide_le`. Rend le nombre d'ajouts et, pour chaque ligne mise à jour, les colonnes changées.
 */
async function ecrirePaquet(table: NomTableBase, lignes: LigneBase[]): Promise<{ ajoutees: number; misesAJour: LigneMiseAJour[] }> {
  const colonnes = COLONNES_BASES[table] as readonly string[];
  const liste = colonnes.map((c) => `"${c}"`).join(", ");
  const autres = colonnes.filter((c) => c !== "code");
  const nouvelle = (c: string) =>
    table === "actualite" && COLONNES_CHOIX_NOUVEAUTE.has(c)
      ? `CASE WHEN "${table}".etat IN ('valide', 'retire') THEN "${table}"."${c}" ELSE EXCLUDED."${c}" END`
      : COLONNES_VALIDATION.has(c)
        ? `CASE WHEN "${table}".etat = 'valide' THEN "${table}"."${c}" ELSE EXCLUDED."${c}" END`
        : `EXCLUDED."${c}"`;
  const sql = `WITH ecrit AS (
      INSERT INTO "${table}" (${liste}, importe_le)
      SELECT ${liste}, now() FROM json_populate_recordset(NULL::"${table}", $1::json)
      ON CONFLICT (code) DO UPDATE SET ${autres.map((c) => `"${c}" = ${nouvelle(c)}`).join(", ")}, importe_le = now(), modifie_le = now()
      WHERE (${autres.map((c) => `"${table}"."${c}"`).join(", ")}) IS DISTINCT FROM (${autres.map(nouvelle).join(", ")})
      RETURNING *, (xmax = 0) AS ajoutee_
    )
    SELECT e.code, e.ajoutee_ AS ajoutee,
      array_remove(ARRAY[${autres.map((c) => `CASE WHEN a."${c}" IS DISTINCT FROM e."${c}" THEN '${c}' END`).join(", ")}], NULL) AS colonnes
    FROM ecrit e LEFT JOIN "${table}" a ON a.code = e.code`;
  let ajoutees = 0;
  const misesAJour: LigneMiseAJour[] = [];
  for (let i = 0; i < lignes.length; i += PAQUET) {
    const r = await requete<{ code: string; ajoutee: boolean; colonnes: string[] }>(sql, [JSON.stringify(lignes.slice(i, i + PAQUET))]);
    for (const l of r) {
      if (l.ajoutee) ajoutees++;
      else misesAJour.push({ code: l.code, colonnes: l.colonnes });
    }
  }
  return { ajoutees, misesAJour };
}

/** Passe en `retire` les lignes venues d'un import précédent et absentes du fichier (jamais supprimées). */
async function retirerDisparues(table: NomTableBase, codesPresents: string[]): Promise<number> {
  const r = await requete(
    `UPDATE "${table}" SET etat = 'retire', modifie_le = now()
     WHERE importe_le IS NOT NULL AND etat <> 'retire' AND NOT (code = ANY($1::text[])) RETURNING code`,
    [codesPresents],
  );
  return r.length;
}

async function poserDepart(): Promise<{ service: number; compte: number }> {
  const services = await requete(
    `INSERT INTO service (code, nom, serie_studio, passage_site, ordre, etat, version, origine, source)
     SELECT code, nom, serie_studio, passage_site, ordre, 'propose', '1', 'propose', $2
     FROM json_populate_recordset(NULL::service, $1::json)
     ON CONFLICT (code) DO NOTHING RETURNING code`,
    [JSON.stringify(SERVICES_DEPART), SOURCE_SERVICES],
  );
  const comptes = await requete(
    `INSERT INTO compte (code, reseau, identifiant, nature, nom, publieur, actif, etat, version, origine, source)
     SELECT code, reseau, identifiant, nature, nom, 'buffer', false, 'propose', '1', 'repris', $2
     FROM json_populate_recordset(NULL::compte, $1::json)
     ON CONFLICT (code) DO NOTHING RETURNING code`,
    [JSON.stringify(COMPTES_DEPART), SOURCE_COMPTES],
  );
  return { service: services.length, compte: comptes.length };
}

/** Importe les fichiers donnés (par défaut ceux de `bases/`). Tout ou rien en cas de panne : une transaction. */
export async function importerBases(fichiers?: FichierBase[]): Promise<RapportImport> {
  const lus = fichiers ?? (await lireFichiersBases());
  return transaction(async () => {
    await requete("SELECT pg_advisory_xact_lock($1)", [VERROU_IMPORT]);
    const enBase: Partial<Record<NomTableBase, string[]>> = {};
    for (const t of TABLES_RENVOYEES) enBase[t] = (await requete<{ code: string }>(`SELECT code FROM "${t}"`)).map((r) => r.code);

    const preparation = preparer(lus, enBase);
    const tables: ComptesTable[] = [];
    // Une table lue dans plusieurs fichiers (nouveautés) s'écrit en une fois ; si l'un de ces fichiers est refusé,
    // on ne retire rien : on ne sait pas ce qu'il contenait.
    const fusion = new Map<string, TablePreparee>();
    for (const t of preparation.tables) {
      const deja = fusion.get(t.table);
      fusion.set(
        t.table,
        deja
          ? { ...deja, fichier: `${deja.fichier} + ${t.fichier}`, lignes: [...deja.lignes, ...t.lignes], codesPresents: [...deja.codesPresents, ...t.codesPresents], refusees: deja.refusees + t.refusees }
          : t,
      );
    }
    const actualitesIncompletes = preparation.fichiersRefuses.some((f) => f.fichier === "3-sujets.md" || f.fichier.startsWith(DOSSIER_ACTUALITES));
    for (const t of fusion.values()) {
      const { ajoutees, misesAJour } = await ecrirePaquet(t.table, t.lignes);
      if (misesAJour.length) {
        await journaliser("import", `${t.table} : ${misesAJour.length} ligne(s) mise(s) à jour.`, {
          cible: t.table,
          donnees: { lignes: misesAJour },
        });
      }
      const retirees = t.table === "actualite" && actualitesIncompletes ? 0 : await retirerDisparues(t.table, t.codesPresents);
      tables.push({
        table: t.table,
        fichier: t.fichier,
        lues: t.codesPresents.length,
        ajoutees,
        mises_a_jour: misesAJour.length,
        retirees,
        refusees: t.refusees,
      });
    }
    const depart = await poserDepart();

    const rapport: RapportImport = {
      le: new Date().toISOString(),
      fichiers: lus.map((f) => f.nom),
      tables,
      fichiersRefuses: preparation.fichiersRefuses,
      lignesRefusees: preparation.lignesRefusees,
      ignorees: preparation.ignorees,
      depart,
    };
    const somme = (k: "ajoutees" | "mises_a_jour" | "retirees" | "refusees") => tables.reduce((n, t) => n + t[k], 0);
    const refuses = preparation.fichiersRefuses.length;
    await journaliser(
      "import",
      `Bases rechargées : ${somme("ajoutees")} ajoutée(s), ${somme("mises_a_jour")} mise(s) à jour, ${somme("retirees")} retirée(s), ` +
        `${somme("refusees")} ligne(s) refusée(s)${refuses ? `, ${refuses} fichier(s) refusé(s)` : ""}.`,
      { cible: "bases", donnees: { ...rapport, lignesRefusees: rapport.lignesRefusees.slice(0, MAX_LIGNES_REFUSEES_JOURNAL) } },
    );
    return rapport;
  });
}

/** Le dernier rapport d'import, relu dans le journal (null si les bases n'ont jamais été chargées). */
export async function dernierRapport(): Promise<RapportImport | null> {
  const [r] = await requete<{ donnees: RapportImport | null }>(
    "SELECT donnees FROM journal WHERE sujet = 'import' AND cible = 'bases' ORDER BY id DESC LIMIT 1",
  );
  return r?.donnees ?? null;
}

/** Interrupteur de l'écran « Réglages › Bases » : posé éteint par la migration 016, jamais rallumé par le code. */
export const INTERRUPTEUR_BASES = "bases.recharger";
