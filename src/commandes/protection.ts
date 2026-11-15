/**
 * Règle pure : ce que devient une mise en ligne quand la fabrication de la vidéo échoue.
 * Aucune lecture ni écriture : ni base, ni Studio, ni diffuseur. Les états viennent du contrat (échanges).
 * Rien n'est jamais archivé ni effacé ; la décision est seulement rendue à l'appelant.
 */
import type { ETATS_PUBLICATION_STUDIO, ETATS_VIDEO_STUDIO } from "@/contrats/echanges";

export type EtatVideoStudio = (typeof ETATS_VIDEO_STUDIO)[number];
export type EtatPublicationStudio = (typeof ETATS_PUBLICATION_STUDIO)[number];

export type EntreeProtection = {
  etatVideo: EtatVideoStudio;
  /** Absente (null) tant que rien n'a été préparé pour la mise en ligne. */
  etatPublication: EtatPublicationStudio | null;
  programmeeLe: string | null;
};

export type DecisionProtection = "garder" | "a_refaire" | "a_regarder" | "rien";

export type EffetProtection = {
  decision: DecisionProtection;
  phrase: string;
  /** Présente seulement quand la mise en ligne est gardée telle quelle. */
  alerte?: string;
  etatPublication: EtatPublicationStudio | null;
  programmeeLe: string | null;
};

export function effetEchecFabrication(entree: EntreeProtection): EffetProtection {
  const { etatVideo, etatPublication, programmeeLe } = entree;
  const inchange = { etatPublication, programmeeLe };

  if (etatPublication === "echec") {
    return { decision: "a_regarder", phrase: "La mise en ligne n'a pas abouti : à regarder, rien n'est relancé tout seul.", ...inchange };
  }
  if (etatVideo !== "echec") {
    return { decision: "rien", phrase: "La fabrication n'est pas en échec : rien à faire.", ...inchange };
  }
  if (etatPublication === "programmee" || etatPublication === "publiee") {
    return {
      decision: "garder",
      phrase: "La fabrication a échoué, mais la mise en ligne reste telle quelle.",
      alerte: "La fabrication de la vidéo a échoué : la mise en ligne déjà prévue est conservée, date comprise. À regarder.",
      ...inchange,
    };
  }
  return {
    decision: "a_refaire",
    phrase: "La fabrication a échoué avant toute programmation : la vidéo est à refaire.",
    ...inchange,
  };
}
