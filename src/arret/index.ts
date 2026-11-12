/**
 * U-ARRET · « Tout arrêter ». L'état est l'interrupteur `arret.tout` (allumé = arrêté), lu en base à chaque appel :
 * un redémarrage du serveur ne relance rien, seule la reprise (geste du fondateur, notée au journal) l'éteint.
 * Lecture impossible = arrêté : dans le doute rien ne part. L'arrêt n'efface aucune donnée.
 * Tout envoi, appel sortant ou commande automatique passe par `sousArret`.
 */
import { depots, journaliser } from "@/donnees";
import { requete } from "@/lib/base";

export const CODE_ARRET = "arret.tout";

export type NatureAction = "envoi" | "commande" | "reponse_automatique";
export type ResultatSousArret<T> = { fait: true; valeur: T } | { fait: false; raison: "arrete" };

/** Vrai si « Tout arrêter » est actif, ou si l'état est illisible. */
export async function estArrete(): Promise<boolean> {
  try {
    const [r] = await requete<{ allume: boolean }>("SELECT allume FROM interrupteur WHERE code = $1 AND archive_le IS NULL", [CODE_ARRET]);
    return r === undefined ? true : r.allume === true;
  } catch {
    return true;
  }
}

/** État pour la porte : jamais de donnée de personne. `depuis` : instant de l'arrêt, ou null. */
export async function etatArret(): Promise<{ arrete: boolean; depuis: string | null }> {
  if (!(await estArrete())) return { arrete: false, depuis: null };
  try {
    const [r] = await requete<{ modifie_le: Date }>("SELECT modifie_le FROM interrupteur WHERE code = $1", [CODE_ARRET]);
    return { arrete: true, depuis: r ? new Date(r.modifie_le).toISOString() : new Date(0).toISOString() };
  } catch {
    return { arrete: true, depuis: new Date(0).toISOString() };
  }
}

/** Joue `action` seulement si rien n'est arrêté ; sinon ne l'appelle pas. */
export async function sousArret<T>(_nature: NatureAction, action: () => Promise<T>): Promise<ResultatSousArret<T>> {
  if (await estArrete()) return { fait: false, raison: "arrete" };
  return { fait: true, valeur: await action() };
}

async function poser(allume: boolean): Promise<void> {
  const ligne = await depots.interrupteur.lire(CODE_ARRET);
  if (!ligne || ligne.archive_le || ligne.allume === allume) return;
  await depots.interrupteur.modifier(CODE_ARRET, { allume });
  await journaliser("arret", allume ? "Tout arrêter : tout est arrêté." : "Reprise : geste du fondateur.", { cible: CODE_ARRET });
}

/** Arrête tout. Déjà arrêté : rien de plus. */
export const arreter = () => poser(true);
/** Reprise, sur geste du fondateur seulement (appelée par l'action du bouton, après exigerSession). */
export const reprendre = () => poser(false);
