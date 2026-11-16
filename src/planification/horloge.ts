/**
 * U-HORLOGE · lancement hebdomadaire de la proposition de la semaine, sans IA, déclenché par la tâche du serveur (crontab).
 * Il PROPOSE seulement (même chemin que le bouton « Ma semaine » : jours « à valider » au Studio) : aucune publication, aucune dépense.
 * Éteint par défaut (interrupteur `horloge.semaine`) ; « Tout arrêter » prime ; une semaine déjà proposée ne se relance pas.
 * Secret propre, distinct de celui de la porte : `USINE_HORLOGE_SECRET` (32 caractères au moins) ; absent ou court : tout est refusé.
 */
import "server-only";
import { estArrete } from "@/arret";
import { interrupteurAllume, journaliser } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { enteteValide } from "@/porte/acces";
import { lundiVise, proposerLaSemaine } from "@/planification";

export const INTERRUPTEUR_HORLOGE = "horloge.semaine";
export const VARIABLE_HORLOGE = "USINE_HORLOGE_SECRET";
const LONGUEUR_MIN = 32;

export type RaisonHorloge = "eteint" | "arrete" | "deja_fait" | "lance";
export interface ResultatHorloge {
  lance: boolean;
  raison: RaisonHorloge;
  envoyees: number;
}

/** Le secret de l'horloge, ou null (aucun appel accepté). */
export function secretHorloge(env: Record<string, string | undefined> = process.env): string | null {
  const s = env[VARIABLE_HORLOGE]?.trim() ?? "";
  return s.length >= LONGUEUR_MIN ? s : null;
}

/** Vrai seulement avec `Authorization: Bearer <secret de l'horloge>` (comparaison en temps constant). */
export function accesHorloge(requete: Pick<Request, "headers">, env: Record<string, string | undefined> = process.env): boolean {
  const secret = secretHorloge(env);
  return secret !== null && enteteValide(requete.headers.get("authorization"), secret);
}

export const horlogeAllumee = () => interrupteurAllume(INTERRUPTEUR_HORLOGE);

/** Propose la semaine visée, une seule fois (la semaine est marquée faite au journal dès qu'au moins un jour est parti au Studio). */
export async function lancerHorloge(): Promise<ResultatHorloge> {
  if (!(await horlogeAllumee())) return { lance: false, raison: "eteint", envoyees: 0 };
  if (await estArrete()) return { lance: false, raison: "arrete", envoyees: 0 };
  const lundi = await lundiVise();
  const cible = `horloge:${lundi}`;
  return transaction(async () => {
    // Deux déclenchements en même temps s'attendent l'un l'autre : le second voit la semaine déjà faite.
    await requete(`SELECT pg_advisory_xact_lock(hashtext('horloge-semaine'))`);
    const faite = await requete(`SELECT 1 AS n FROM journal WHERE sujet = 'horloge' AND cible = $1 LIMIT 1`, [cible]);
    if (faite.length > 0) return { lance: false, raison: "deja_fait" as const, envoyees: 0 };
    const r = await proposerLaSemaine(lundi);
    if (r.envoyees > 0) await journaliser("horloge", "La semaine a été proposée automatiquement.", { cible, donnees: { envoyees: r.envoyees } });
    return { lance: true, raison: "lance" as const, envoyees: r.envoyees };
  });
}
