/**
 * Écran « Mots en commentaire » (lecture seule) : regroupe par mot les chiffres reçus du CRM.
 * Fonctions pures, aucune écriture. Une cellule masquée (null, « <3 ») n'est jamais comptée comme zéro.
 */
import type { AgregatLu } from "./index";

/** Mots du catalogue des guides (CATALOGUE-GUIDES-BROUILLON.md des plans). Un mot reçu hors de cette liste est ajouté à la suite. */
export const MOTS_CATALOGUE = ["GUIDE", "TEMPS", "MAIL", "DEVIS", "RESEAUX", "DONNEES", "OUTILS", "EQUIPE"] as const;

export const COLONNES = [
  { cle: "demandes", libelle: "Demandes" },
  { cle: "guides_envoyes", libelle: "Guides envoyés" },
  { cle: "accords", libelle: "E-mails confirmés" },
] as const;
type Cle = (typeof COLONNES)[number]["cle"];

export interface Total {
  somme: number;
  /** Au moins une cellule masquée (moins de 3) : la somme est un minimum. */
  masquee: boolean;
}
export interface LigneDetail {
  jour: string;
  compte: string;
  reseau: string;
  demandes: number | null;
  guides_envoyes: number | null;
  accords: number | null;
}
export interface VueMot {
  mot: string;
  recu: boolean;
  totaux: Record<Cle, Total>;
  detail: LigneDetail[];
}

const vide = (): Record<Cle, Total> => ({ demandes: { somme: 0, masquee: false }, guides_envoyes: { somme: 0, masquee: false }, accords: { somme: 0, masquee: false } });

export function vueParMot(lignes: readonly AgregatLu[]): VueMot[] {
  const hors = [...new Set(lignes.map((x) => x.mot))].filter((m) => !(MOTS_CATALOGUE as readonly string[]).includes(m)).sort();
  return [...MOTS_CATALOGUE, ...hors].map((mot) => {
    const siennes = lignes.filter((x) => x.mot === mot);
    const totaux = vide();
    for (const x of siennes)
      for (const { cle } of COLONNES) {
        if (x[cle] === null) totaux[cle].masquee = true;
        else totaux[cle].somme += x[cle];
      }
    const detail = siennes
      .map(({ jour, compte, reseau, demandes, guides_envoyes, accords }) => ({ jour, compte, reseau, demandes, guides_envoyes, accords }))
      .sort((a, b) => b.jour.localeCompare(a.jour) || a.compte.localeCompare(b.compte) || a.reseau.localeCompare(b.reseau));
    return { mot, recu: siennes.length > 0, totaux, detail };
  });
}
