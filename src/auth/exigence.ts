/**
 * U-SECOND-CODE-ETEINT · Le second code (application du téléphone) est-il exigé à la connexion ?
 * Interrupteur `connexion.second-code` (table `interrupteur`, livré ÉTEINT par la migration 041) :
 * - éteint, ou ligne absente/archivée : le mot de passe seul ouvre la session ;
 * - allumé : second code imposé (comportement de la 027).
 * Lecture impossible (base injoignable) : le second code est EXIGÉ (échec fermé). Ce n'est pas `interrupteurAllume()`,
 * qui vaut « éteint » en cas d'erreur : ici une panne ne doit jamais ouvrir l'accès. Pas de variable d'environnement.
 */
import { requete } from "@/lib/base";

export const INTERRUPTEUR_SECOND_CODE = "connexion.second-code";

export async function secondCodeExige(): Promise<boolean> {
  try {
    const [r] = await requete<{ allume: boolean }>("SELECT allume FROM interrupteur WHERE code = $1 AND archive_le IS NULL", [INTERRUPTEUR_SECOND_CODE]);
    return r?.allume === true;
  } catch {
    return true;
  }
}
