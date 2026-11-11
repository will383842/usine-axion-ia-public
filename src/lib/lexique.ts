/**
 * Lexique des écrans (PLAN-MAITRE C14) : les mots qui ne s'écrivent jamais dans un texte d'écran.
 * Lu par la garde de la CI (`scripts/garde.mjs`), qui refuse un texte d'écran qui en contient un.
 */
export const MOTS_INTERDITS_A_L_ECRAN = [
  "CRM",
  "lead",
  "batch",
  "job",
  "prompt",
  "token",
  "workflow",
  "persona",
  "pipeline",
  "aimant",
  "séquence",
  "Grenoble",
  "Aucun gain garanti",
  "likez",
  "Supprimer",
] as const;

const LETTRE = "\\p{L}\\p{N}_";

/** Mots interdits trouvés dans un texte (casse ignorée, mot entier). */
export function motsInterditsDans(texte: string): string[] {
  return MOTS_INTERDITS_A_L_ECRAN.filter((mot) => new RegExp(`(?<![${LETTRE}])${mot}s?(?![${LETTRE}])`, "iu").test(texte));
}
