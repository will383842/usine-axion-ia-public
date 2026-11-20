/**
 * U-SECOND-CODE-ETEINT + SCC-3 · Quel second code est exigé à la connexion ?
 * Deux interrupteurs (table `interrupteur`, livrés ÉTEINTS) : `connexion.second-code` (application du téléphone, 041)
 * et `connexion.second-code-courriel` (courriel, 042). Lus en UNE requête, avec la mise en service confirmée du courriel.
 * - mode « courriel » : interrupteur courriel allumé ET une mise en service confirmée non archivée existe. Il l'emporte
 *   si les deux sont allumés (SQL direct) : on ne bloque pas le fondateur dehors. Sans mise en service, personne ne peut
 *   porter `scm` : le courriel n'est pas exigé (le mot de passe seul vaut, ou l'application si elle est allumée) ;
 * - mode « application » : seulement `connexion.second-code` allumé (comportement de la 027) ;
 * - mode « aucun » : ligne absente, archivée ou éteinte : le mot de passe seul ouvre la session (réserve R2, inchangée).
 * Lecture impossible (base injoignable) : `lireExigence` lève ; `secondCodeExige` vaut « exigé » et `sessionComplete`
 * ne rend aucune session (échec fermé). Ce n'est pas `interrupteurAllume()`, qui vaut « éteint » en cas d'erreur.
 */
import { requete } from "@/lib/base";

export const INTERRUPTEUR_SECOND_CODE = "connexion.second-code";
export const INTERRUPTEUR_SECOND_CODE_COURRIEL = "connexion.second-code-courriel";

export type ModeSecondCode = "aucun" | "application" | "courriel";
export interface Exigence {
  mode: ModeSecondCode;
  /** Identifiant de la mise en service confirmée (futur `scm` du jeton) ; seulement en mode « courriel ». */
  service?: string;
}

export async function lireExigence(): Promise<Exigence> {
  const [r] = await requete<{ app: boolean | null; courriel: boolean | null; service: string | null }>(
    `SELECT (SELECT allume FROM interrupteur WHERE code = $1 AND archive_le IS NULL) AS app,
            (SELECT allume FROM interrupteur WHERE code = $2 AND archive_le IS NULL) AS courriel,
            (SELECT id::text FROM second_code_courriel_service WHERE archive_le IS NULL AND confirme_le IS NOT NULL) AS service`,
    [INTERRUPTEUR_SECOND_CODE, INTERRUPTEUR_SECOND_CODE_COURRIEL],
  );
  if (r.courriel === true && r.service) return { mode: "courriel", service: r.service };
  return { mode: r.app === true ? "application" : "aucun" };
}

/** Un second code est-il exigé ? Lecture impossible : oui (échec fermé). */
export async function secondCodeExige(): Promise<boolean> {
  try {
    return (await lireExigence()).mode !== "aucun";
  } catch {
    return true;
  }
}

/** Le mode, sans lever : lecture impossible = « application » (exigé, jamais ouvert). */
export async function modeSecondCode(): Promise<ModeSecondCode> {
  try {
    return (await lireExigence()).mode;
  } catch {
    return "application";
  }
}
