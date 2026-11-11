/**
 * Préparation du chargement (sans base) : lit les fichiers, applique les règles de lecture et décide, fichier par
 * fichier, ce qui est refusé (CONTRATS-ECHANGE.md § 2).
 * Refus du fichier entier : table inconnue, en-têtes qui ne sont pas les colonnes de la table, ligne au mauvais
 * nombre de colonnes, ligne sans code, code en double, `etat` hors liste, renvoi introuvable (un renvoi vers une
 * ligne refusée est introuvable).
 * Refus d'une seule ligne : `source` absente alors que `origine = repris`.
 */
import { TABLES_BASES_IMPORTEES } from "@/contrats";
import { COLONNES_BASES, type NomTableBase } from "@/donnees/schema";
import { lireTables } from "./lecteur";
import { casOrigine, cibleAppel, lireEtat, lireListe, sourceManquante } from "./regles";

/** Dossier des nouveautés déposées chaque semaine : leurs fichiers complètent la table `actualite`. */
export const DOSSIER_ACTUALITES = "actualites/";

export interface FichierBase {
  nom: string;
  texte: string;
}

export type LigneBase = Record<string, string | null>;

export interface LigneRefusee {
  fichier: string;
  table: string;
  numero: number;
  code: string;
  raison: string;
}

export interface FichierRefuse {
  fichier: string;
  raisons: string[];
}

export interface TablePreparee {
  table: NomTableBase;
  fichier: string;
  /** Lignes à écrire, règles de lecture appliquées. */
  lignes: LigneBase[];
  /** Tous les codes présents dans le fichier (lignes refusées comprises) : aucun n'est retiré. */
  codesPresents: string[];
  refusees: number;
}

export interface Preparation {
  tables: TablePreparee[];
  fichiersRefuses: FichierRefuse[];
  lignesRefusees: LigneRefusee[];
  /** Tables des bases lues mais jamais importées (la table `compte` : comptes réels tenus par l'Usine). */
  ignorees: string[];
}

/** Renvois vérifiés : une valeur (ou chaque élément d'une liste) doit être un code de l'une des tables visées. */
const RENVOIS: { table: NomTableBase; colonne: string; vers: NomTableBase[]; liste?: boolean }[] = [
  { table: "metier", colonne: "secteur", vers: ["secteur"] },
  { table: "douleur", colonne: "cible", vers: ["metier", "public"] },
  { table: "objection", colonne: "cible", vers: ["metier", "public"] },
  { table: "souci_releve", colonne: "cible", vers: ["metier", "public"] },
  { table: "cas_usage", colonne: "cible", vers: ["metier", "public"] },
  { table: "cas_usage", colonne: "douleurs", vers: ["douleur"], liste: true },
  { table: "sujet", colonne: "famille", vers: ["famille"] },
  { table: "cas_usage", colonne: "sujet", vers: ["sujet"] },
];

/** Tables dont les codes servent aux renvois (lus aussi en base). */
export const TABLES_RENVOYEES: NomTableBase[] = ["secteur", "metier", "public", "douleur", "famille", "sujet", "cas_usage"];

const MAX_RAISONS = 20;

interface FichierLu {
  fichier: string;
  raisons: string[];
  tables: { table: NomTableBase; lignes: { numero: number; brute: LigneBase }[] }[];
}

function lireFichier(f: FichierBase, ignorees: Set<string>): FichierLu {
  const lu: FichierLu = { fichier: f.nom, raisons: [], tables: [] };
  const tables = lireTables(f.texte);
  if (!tables.length) lu.raisons.push("aucune table annoncée par « ## table: »");
  for (const t of tables) {
    if (t.nom === "compte") {
      ignorees.add(t.nom);
      continue;
    }
    if (!(TABLES_BASES_IMPORTEES as readonly string[]).includes(t.nom)) {
      lu.raisons.push(`table inconnue « ${t.nom} » (ligne ${t.numero})`);
      continue;
    }
    const table = t.nom as NomTableBase;
    const attendues: readonly string[] = COLONNES_BASES[table];
    const manquantes = attendues.filter((c) => !t.entetes.includes(c));
    const enTrop = t.entetes.filter((c) => !attendues.includes(c));
    const doubles = t.entetes.filter((c, i) => t.entetes.indexOf(c) !== i);
    if (manquantes.length || enTrop.length || doubles.length) {
      const detail = [
        manquantes.length ? `il manque ${manquantes.join(", ")}` : "",
        enTrop.length ? `colonnes inconnues ${enTrop.join(", ")}` : "",
        doubles.length ? `colonnes en double ${doubles.join(", ")}` : "",
      ].filter(Boolean);
      lu.raisons.push(`table ${table} : ${detail.join(" ; ")} (ligne ${t.numero})`);
      continue;
    }
    const lignes: { numero: number; brute: LigneBase }[] = [];
    for (const l of t.lignes) {
      if (l.valeurs.length !== t.entetes.length) {
        lu.raisons.push(`table ${table}, ligne ${l.numero} : ${l.valeurs.length} colonnes au lieu de ${t.entetes.length}`);
        continue;
      }
      const brute: LigneBase = {};
      t.entetes.forEach((c, i) => (brute[c] = l.valeurs[i] === "" ? null : l.valeurs[i]));
      lignes.push({ numero: l.numero, brute });
    }
    lu.tables.push({ table, lignes });
  }
  // Codes vides, en double, états hors liste.
  for (const { table, lignes } of lu.tables) {
    const vus = new Map<string, number>();
    for (const { numero, brute } of lignes) {
      const code = brute.code;
      if (!code) {
        lu.raisons.push(`table ${table}, ligne ${numero} : code absent`);
        continue;
      }
      const avant = vus.get(code);
      if (avant !== undefined) lu.raisons.push(`table ${table} : code en double « ${code} » (lignes ${avant} et ${numero})`);
      else vus.set(code, numero);
      if (!lireEtat(brute.etat ?? "")) lu.raisons.push(`table ${table}, ligne ${numero} : état « ${brute.etat ?? ""} » hors liste`);
    }
  }
  return lu;
}

/** Codes visables par un renvoi : ceux de la base et des fichiers non refusés, moins ceux des lignes refusées. */
function codesDe(lus: FichierLu[], refuses: Set<string>, enBase: Partial<Record<NomTableBase, Iterable<string>>>) {
  const codes = new Map<NomTableBase, Set<string>>();
  for (const t of TABLES_RENVOYEES) codes.set(t, new Set(enBase[t] ?? []));
  for (const lu of lus) {
    if (refuses.has(lu.fichier)) continue;
    for (const { table, lignes } of lu.tables) {
      const s = codes.get(table);
      if (!s) continue;
      for (const { brute } of lignes) {
        if (!brute.code) continue;
        if (sourceManquante(brute.origine, brute.source)) s.delete(brute.code);
        else s.add(brute.code);
      }
    }
  }
  return codes;
}

function renvoisIntrouvables(lu: FichierLu, codes: Map<NomTableBase, Set<string>>): string[] {
  const raisons: string[] = [];
  for (const { table, lignes } of lu.tables) {
    for (const r of RENVOIS.filter((x) => x.table === table)) {
      for (const { numero, brute } of lignes) {
        const valeurs = r.liste ? lireListe(brute[r.colonne]) : brute[r.colonne] ? [brute[r.colonne] as string] : [];
        for (const v of valeurs) {
          if (!r.vers.some((t) => codes.get(t)?.has(v))) {
            raisons.push(`table ${table}, ligne ${numero} : ${r.colonne} « ${v} » introuvable`);
          }
        }
      }
    }
  }
  return raisons;
}

function resumer(raisons: string[]): string[] {
  if (raisons.length <= MAX_RAISONS) return raisons;
  return [...raisons.slice(0, MAX_RAISONS), `et ${raisons.length - MAX_RAISONS} autre(s)`];
}

/**
 * `enBase` : les codes déjà rangés dans la base pour les tables renvoyées (un renvoi peut viser une ligne déjà
 * importée). Un fichier refusé ne fournit aucun code : un autre fichier qui renvoie vers lui peut l'être à son tour.
 */
export function preparer(fichiers: FichierBase[], enBase: Partial<Record<NomTableBase, Iterable<string>>> = {}): Preparation {
  const ignorees = new Set<string>();
  const lus = fichiers.map((f) => lireFichier(f, ignorees));
  const raisons = new Map<string, string[]>(lus.filter((l) => l.raisons.length).map((l) => [l.fichier, l.raisons]));

  // Code en double d'un fichier à l'autre pour une même table.
  const proprietaire = new Map<string, string>();
  const codesActualite = new Map<string, string>();
  for (const lu of lus) {
    for (const { table, lignes } of lu.tables) {
      const autre = proprietaire.get(table);
      // Les nouveautés de la semaine (`actualites/*.md`) complètent la table `actualite` de la base 3, sans partager un code.
      if (table === "actualite" && lus.some((x) => x.fichier.startsWith(DOSSIER_ACTUALITES))) {
        const doubles = lignes.filter(({ brute }) => brute.code && codesActualite.has(brute.code)).map(({ brute }) => `code « ${brute.code} » déjà dans ${codesActualite.get(brute.code as string)}`);
        if (doubles.length) raisons.set(lu.fichier, [...(raisons.get(lu.fichier) ?? []), ...doubles.map((d) => `table ${table} : ${d}`)]);
        else for (const { brute } of lignes) if (brute.code) codesActualite.set(brute.code, lu.fichier);
        if (!autre) proprietaire.set(table, lu.fichier);
        continue;
      }
      if (autre) raisons.set(lu.fichier, [...(raisons.get(lu.fichier) ?? []), `table ${table} déjà lue dans ${autre}`]);
      else proprietaire.set(table, lu.fichier);
    }
  }

  // Renvois : jusqu'à ce que plus aucun fichier ne tombe.
  for (;;) {
    const refuses = new Set(raisons.keys());
    const codes = codesDe(lus, refuses, enBase);
    let change = false;
    for (const lu of lus) {
      if (refuses.has(lu.fichier)) continue;
      const introuvables = renvoisIntrouvables(lu, codes);
      if (introuvables.length) {
        raisons.set(lu.fichier, introuvables);
        change = true;
      }
    }
    if (!change) break;
  }

  const refuses = new Set(raisons.keys());
  const codesCas = codesDe(lus, refuses, enBase).get("cas_usage") ?? new Set<string>();
  const tables: TablePreparee[] = [];
  const lignesRefusees: LigneRefusee[] = [];
  for (const lu of lus) {
    if (refuses.has(lu.fichier)) continue;
    for (const { table, lignes } of lu.tables) {
      const prete: TablePreparee = { table, fichier: lu.fichier, lignes: [], codesPresents: [], refusees: 0 };
      for (const { numero, brute } of lignes) {
        const code = brute.code as string;
        prete.codesPresents.push(code);
        if (sourceManquante(brute.origine, brute.source)) {
          lignesRefusees.push({ fichier: lu.fichier, table, numero, code, raison: "origine « repris » sans source" });
          prete.refusees++;
          continue;
        }
        const ligne: LigneBase = { ...brute, etat: lireEtat(brute.etat ?? "") };
        if (table === "appel") ligne.cible = cibleAppel(brute.cible);
        if (table === "cas_usage") ligne.cas_origine = casOrigine(brute.cas_origine, codesCas);
        prete.lignes.push(ligne);
      }
      tables.push(prete);
    }
  }

  return {
    tables,
    fichiersRefuses: [...raisons].map(([fichier, r]) => ({ fichier, raisons: resumer(r) })),
    lignesRefusees,
    ignorees: [...ignorees],
  };
}
