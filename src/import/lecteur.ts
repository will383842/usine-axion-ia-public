/**
 * Lecteur des fichiers `bases/*.md` (CONTRATS-ECHANGE.md § 2) : chaque table est annoncée par `## table: <nom>`,
 * suivie d'un tableau dont les en-têtes sont les noms de champs. Le tableau s'arrête à la première ligne qui
 * ne commence pas par « | ». Rien n'est interprété ici : les règles de lecture sont dans `regles.ts`.
 */

export interface LigneLue {
  /** Numéro de la ligne dans le fichier (pour le rapport). */
  numero: number;
  valeurs: string[];
}

export interface TableLue {
  nom: string;
  /** Ligne du `## table:` dans le fichier. */
  numero: number;
  entetes: string[];
  lignes: LigneLue[];
}

const ANNONCE = /^##\s+table:\s*(\S+)\s*$/;
const SEPARATION = /^:?-{3,}:?$/;

/** Découpe une ligne de tableau en cellules (« \| » vaut une barre dans une cellule). */
export function cellules(ligne: string): string[] {
  let corps = ligne.trim();
  if (corps.startsWith("|")) corps = corps.slice(1);
  if (corps.endsWith("|") && !corps.endsWith("\\|")) corps = corps.slice(0, -1);
  return corps.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

export function lireTables(texte: string): TableLue[] {
  const tables: TableLue[] = [];
  const lignes = texte.split(/\r?\n/);
  let courante: TableLue | null = null;
  let dansTableau = false;
  lignes.forEach((brute, i) => {
    const numero = i + 1;
    const annonce = ANNONCE.exec(brute);
    if (annonce) {
      courante = { nom: annonce[1], numero, entetes: [], lignes: [] };
      tables.push(courante);
      dansTableau = false;
      return;
    }
    if (!courante) return;
    const ligne = brute.trim();
    if (!ligne.startsWith("|")) {
      // Avant le tableau : texte libre permis. Après : le tableau est fini.
      if (dansTableau) {
        courante = null;
        dansTableau = false;
      }
      return;
    }
    dansTableau = true;
    const valeurs = cellules(ligne);
    if (!courante.entetes.length) {
      courante.entetes = valeurs;
      return;
    }
    if (valeurs.every((v) => SEPARATION.test(v))) return;
    courante.lignes.push({ numero, valeurs });
  });
  return tables;
}
