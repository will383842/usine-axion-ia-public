/** UO-08 · CSV pour tableur : UTF-8 avec BOM, séparateur « ; », fin de ligne CRLF, dates JJ/MM/AAAA. Aucune écriture, aucun accès à la base. */
export const SEPARATEUR = ";";
const BOM = "﻿";

/** Un tableur lit « = + - @ » en tête de cellule comme une formule : on préfixe d'une apostrophe. */
export const neutraliser = (valeur: string): string => (/^[=+\-@]/.test(valeur) ? `'${valeur}` : valeur);

const cellule = (valeur: string): string => {
  const v = neutraliser(valeur);
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function versCsv(entetes: string[], lignes: string[][]): string {
  return BOM + [entetes, ...lignes].map((l) => l.map(cellule).join(SEPARATEUR)).join("\r\n") + "\r\n";
}

/** « 2026-10-05 » → « 05/10/2026 ». */
export const dateFrancaise = (jour: string): string => jour.split("-").reverse().join("/");

export const moisValide = (mois: string | null | undefined): mois is string => typeof mois === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mois);

/** Premier jour du mois et premier jour du mois suivant, « AAAA-MM-JJ ». */
export function bornesDuMois(mois: string): { debut: string; fin: string } {
  const [a, m] = mois.split("-").map(Number);
  const suivant = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return { debut: `${mois}-01`, fin: `${suivant}-01` };
}
