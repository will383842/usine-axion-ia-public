/**
 * Plafonds par vidéo, rappelés à l'écran Réglages › Poids et plafond (lecture seule).
 * Source : décisions du pilote vidéo du 21/11 ; valeur du Studio `src/services/plafond-tutoriel.ts`.
 * Ces montants sont fixés dans le Studio : les modifier ici ne change rien à ce que le Studio applique.
 */
export const PLAFOND_TUTORIEL_EUR = 1;
export const PLAFOND_VOIX_REFAITE_EUR = 0.6;
export const PLAFOND_REGARD_TABLEAU_EUR = 0.65;
export const REGARDS_TABLEAU_MAX = 2;
export const PLAFOND_VOIX_TABLEAU_DE_BORD_EUR = 1;
export const PLAFOND_TOTAL_VIDEO_EUR = 1.25;

/** « 1 € », « 0,60 € » : virgule française, deux décimales seulement si nécessaire. */
export function montantEur(v: number): string {
  const texte = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
  return `${texte}\u00A0€`;
}

export const PHRASE_PLAFONDS_VIDEO =
  "Ces montants sont fixés dans le Studio. Ils sont rappelés ici pour information : rien ne se règle sur cet écran.";

export const LIGNES_PLAFONDS_VIDEO: { libelle: string; texte: string }[] = [
  { libelle: "Tutoriel", texte: `${montantEur(PLAFOND_TUTORIEL_EUR)} par vidéo au plus (l'Usine s'arrête si ce montant est dépassé)` },
  { libelle: "Voix refaite", texte: `${montantEur(PLAFOND_VOIX_REFAITE_EUR)} au plus` },
  { libelle: "Regard du tableau", texte: `${montantEur(PLAFOND_REGARD_TABLEAU_EUR)} au plus (${REGARDS_TABLEAU_MAX} regards au plus)` },
  { libelle: "Voix du tableau de bord", texte: `${montantEur(PLAFOND_VOIX_TABLEAU_DE_BORD_EUR)} au plus` },
  { libelle: "Total par vidéo", texte: `${montantEur(PLAFOND_TOTAL_VIDEO_EUR)} au plus` },
];
