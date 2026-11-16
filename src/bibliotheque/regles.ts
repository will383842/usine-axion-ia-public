/** UO-03 · parties pures de la bibliothèque : filtres lus dans l'adresse, phrases d'écran. */
import { RESEAUX, TYPES_CONTENU } from "@/contrats";
import { PHRASE_ARRET } from "@/commandes/regles";

export const PHRASE_ARRET_REFAIRE = PHRASE_ARRET;
export const PHRASE_ECRAN_ETEINT = "Cet écran est éteint : allumez-le dans Réglages › Interrupteurs.";
export const PHRASE_LIGNE_INTROUVABLE = "Cette vidéo n'existe plus ou n'est pas encore fabriquée.";
export const PHRASE_REFAITE = "C'est noté : une nouvelle vidéo vous attend dans le lot de reprises, à relire avant de commander.";
export const ETATS_BIBLIOTHEQUE = ["fabriquee", "publiee"] as const;
/** Une ligne se refait quand elle est fabriquée, publiée ou refusée. */
export const ETATS_REFAISABLES = ["fabriquee", "publiee", "refusee"] as const;
export const MAX_LIGNES = 100;

export interface Filtres {
  metier: string | null;
  reseau: string | null;
  type: string | null;
}

const un = (v: string | string[] | undefined): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Ne garde que des valeurs connues : un filtre inconnu est ignoré, jamais passé tel quel. */
export function filtresDepuis(q: Record<string, string | string[] | undefined>): Filtres {
  const metier = un(q.metier);
  const reseau = un(q.reseau);
  const type = un(q.type);
  return {
    metier: metier && /^[a-z0-9][a-z0-9.-]{0,79}$/.test(metier) ? metier : null,
    reseau: reseau && (RESEAUX as readonly string[]).includes(reseau) ? reseau : null,
    type: type && (TYPES_CONTENU as readonly string[]).includes(type) ? type : null,
  };
}

export const LIBELLE_TYPE: Record<string, string> = { video: "Vidéo", carrousel: "Carrousel", image: "Image", texte: "Texte", story: "Story" };
