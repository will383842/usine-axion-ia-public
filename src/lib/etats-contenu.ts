import type { NomIcone } from "@/components/ui/Icone";
import type { TonPastille } from "@/components/ui/Pastille";

/**
 * Les 12 états d'un contenu, les mêmes partout (couleur + pictogramme + mot).
 * `plein` : déjà programmé ou publié ; creux (pointillé) : pas encore.
 */
export const ORDRE_ETATS = ["brouillon", "script", "fabrication", "a-valider", "valide", "programme", "publie", "refuse", "echec", "annule", "archive", "corbeille"] as const;
export type CodeEtat = (typeof ORDRE_ETATS)[number];

export interface EtatContenu {
  code: CodeEtat;
  libelle: string;
  phrase: string;
  icone: NomIcone;
  ton: TonPastille;
  plein: boolean;
}

export const ETATS_CONTENU: readonly EtatContenu[] = [
  { code: "brouillon", libelle: "Brouillon", phrase: "Choisi par l'Usine, rien n'est encore écrit.", icone: "coller", ton: "neutre", plein: false },
  { code: "script", libelle: "Texte à valider", phrase: "Le texte est écrit. Rien n'est encore dépensé.", icone: "demande", ton: "attente", plein: false },
  { code: "fabrication", libelle: "En fabrication", phrase: "Le studio fabrique la vidéo ou le visuel.", icone: "remplacer", ton: "en-cours", plein: false },
  { code: "a-valider", libelle: "À valider", phrase: "Terminé : il attend votre accord.", icone: "ouvrir", ton: "attente", plein: false },
  { code: "valide", libelle: "Validé, pas programmé", phrase: "Votre accord est donné, la date n'est pas encore fixée.", icone: "coche", ton: "fait", plein: false },
  { code: "programme", libelle: "Programmé", phrase: "Une date, une heure et un réseau sont fixés.", icone: "horloge", ton: "fait", plein: true },
  { code: "publie", libelle: "Publié", phrase: "En ligne sur le réseau.", icone: "publie", ton: "publie", plein: true },
  { code: "refuse", libelle: "Refusé", phrase: "Écarté avec un motif, jamais refait à l'identique.", icone: "croix", ton: "refus", plein: false },
  { code: "echec", libelle: "Échec", phrase: "La fabrication ou la publication n'a pas abouti.", icone: "alerte", ton: "refus", plein: false },
  { code: "annule", libelle: "Annulé", phrase: "Arrêté avant la fabrication. Rien n'est dépensé.", icone: "retour", ton: "neutre", plein: false },
  { code: "archive", libelle: "Archivé", phrase: "Masqué, intact, remis en un clic.", icone: "retirer", ton: "neutre", plein: false },
  { code: "corbeille", libelle: "Corbeille", phrase: "Rangé à part, retiré tout seul au bout de 30 jours.", icone: "retirer", ton: "refus", plein: false },
];

export function etatContenu(code: string): EtatContenu {
  return ETATS_CONTENU.find((e) => e.code === code) ?? ETATS_CONTENU[0];
}
