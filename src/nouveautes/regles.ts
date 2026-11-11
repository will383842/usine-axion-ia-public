/** T13 · Règles des nouveautés, sans accès à la base. `perime_le` est une date « AAAA-MM-JJ » ou vide (= jamais périmée). */

export const INTERRUPTEUR_NOUVEAUTES = "nouveautes";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Périmée : la date de péremption est passée (le jour même, elle est encore valable). Vide ou illisible = jamais périmée. */
export function estPerimee(perimeLe: string | null | undefined, aujourdhui: string): boolean {
  const d = (perimeLe ?? "").trim();
  return DATE.test(d) && d < aujourdhui;
}

export const aUneSource = (source: string | null | undefined) => (source ?? "").trim() !== "";

/** Pourquoi une nouveauté ne peut pas être gardée (null = elle peut l'être). */
export function empecheDeGarder(n: { source: string | null; perime_le: string | null }, aujourdhui: string): string | null {
  if (!aUneSource(n.source)) return "Cette nouveauté n'a pas de source : elle ne peut pas être gardée.";
  if (estPerimee(n.perime_le, aujourdhui)) return "Cette nouveauté est périmée : elle n'est plus proposée.";
  return null;
}

/** Première adresse https d'un texte de source (pour le lien « Ouvrir la source »). */
export function lienDeLaSource(source: string | null | undefined): string | null {
  const m = /https:\/\/[^\s)>\]]+/.exec(source ?? "");
  return m ? m[0] : null;
}
