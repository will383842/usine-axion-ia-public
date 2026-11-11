/**
 * Règles de lecture des bases (CONTRATS-ECHANGE.md § 2), une fonction par règle.
 * - appliquées au chargement (la valeur rangée change) : état « remplacee » = `retire` ; `appel.cible = x` se lit
 *   `public.x` ; `cas_origine` qui n'est pas un code = vide ; cellule vide = vide (null) ;
 * - appliquées à la lecture (la valeur des bases est gardée telle quelle, l'Usine l'interprète ici) : listes
 *   séparées par « ; » ; `appuye_sur` ; `douleur.tailles` vide ; `type_contenu` et `formats_conseilles` vides ;
 *   `linkedin-page` ou `linkedin_page`.
 * Gardés tels quels : `souci_releve.force`, `actualite.perime_le` (date ou vide), `offre` (facultative).
 */
import { ETATS, lireListe, TYPES_CONTENU, type Etat, type NatureCompte, type Reseau, type TypeContenu } from "@/contrats";

export { lireListe };

/** États lus dans les bases : ceux du contrat, plus « remplacee » (= `retire`). Tout autre état refuse le fichier. */
export function lireEtat(valeur: string): Etat | null {
  const v = valeur.trim();
  if (v === "remplacee") return "retire";
  return (ETATS as readonly string[]).includes(v) ? (v as Etat) : null;
}

/** `source` exigée seulement si `origine = repris`. */
export function sourceManquante(origine: string | null, source: string | null): boolean {
  return origine === "repris" && !source;
}

/** `appel.cible = x` se lit `public.x` (une valeur déjà écrite `public.x` reste telle quelle). */
export function cibleAppel(valeur: string | null): string | null {
  if (!valeur) return null;
  return valeur.startsWith("public.") ? valeur : `public.${valeur}`;
}

/** `cas_origine` qui n'est pas un code de cas connu = vide. */
export function casOrigine(valeur: string | null, codesCas: ReadonlySet<string>): string | null {
  return valeur && codesCas.has(valeur) ? valeur : null;
}

/** `appuye_sur` = numéros de soucis du même métier (« S1 ; S12 ») → codes `<metier>.s01`, `<metier>.s12`. */
export function soucisAppuyes(cas: { cible: string | null; appuye_sur: string | null }): string[] {
  if (!cas.cible) return [];
  return lireListe(cas.appuye_sur)
    .map((n) => /^S(\d+)$/i.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `${cas.cible}.s${m[1].padStart(2, "0")}`);
}

/** `douleur.tailles` vide = `metier.tailles_typiques`. */
export function taillesDouleur(douleur: { tailles: string | null }, metier: { tailles_typiques: string | null } | null): string[] {
  const propres = lireListe(douleur.tailles);
  return propres.length ? propres : lireListe(metier?.tailles_typiques);
}

/** `type_contenu` vide = tous les types de contenu. */
export function typesContenu(valeur: string | null): TypeContenu[] {
  const liste = lireListe(valeur);
  return liste.length ? (liste as TypeContenu[]) : [...TYPES_CONTENU];
}

/** `formats_conseilles` vide = tous les formats. */
export function formatsConseilles(valeur: string | null, tous: readonly string[]): string[] {
  const liste = lireListe(valeur);
  return liste.length ? liste : [...tous];
}

/** `linkedin-page` ou `linkedin_page` = réseau `linkedin` avec un compte de nature `page`. */
export function lireReseau(valeur: string): { reseau: Reseau | string; nature: NatureCompte | null } {
  const v = valeur.trim();
  if (v === "linkedin-page" || v === "linkedin_page") return { reseau: "linkedin", nature: "page" };
  return { reseau: v, nature: null };
}
