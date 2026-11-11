/**
 * Signature d'un contenu (PLAN-MAITRE A.3 point 13 bis) : métier + taille + service + douleur + cas + format
 * + famille d'accroche. Deux contenus de même signature sont le même contenu : jamais commandé deux fois.
 * Pour une nouveauté (sans cas), la place du cas est tenue par le code de la nouveauté.
 */

export interface PartsSignature {
  metier: string | null;
  taille: string | null;
  service: string | null;
  douleur: string | null;
  cas_usage: string | null;
  actualite?: string | null;
  format: string | null;
  /** Famille d'accroche (`accroche.famille`), rangée dans `lot_ligne.structure`. */
  structure: string | null;
}

const VIDE = "-";

function morceau(v: string | null | undefined): string {
  const t = (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return t ? t.replaceAll("|", "/") : VIDE;
}

export function signature(p: PartsSignature): string {
  return [p.metier, p.taille, p.service, p.douleur, p.cas_usage ?? p.actualite ?? null, p.format, p.structure].map(morceau).join("|");
}
