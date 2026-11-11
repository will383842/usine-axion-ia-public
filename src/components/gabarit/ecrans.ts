/**
 * Les écrans que Will peut allumer, avec leur interrupteur, leur adresse et la phrase qui dit à quoi ils servent.
 * Seul fichier où ces phrases s'écrivent : l'écran éteint, le menu et « Réglages › Interrupteurs » les lisent d'ici.
 */
export interface EcranAllumable {
  code: string;
  nom: string;
  href: string;
  phrase: string;
}

export const ECRANS_ALLUMABLES: readonly EcranAllumable[] = [
  { code: "calendrier", nom: "Mon calendrier", href: "/calendrier", phrase: "Ce qui sort, quel jour, sur quel réseau : vos vidéos réparties par jour, avec les jours sans publication." },
  { code: "nouveautes", nom: "Nouveautés de la semaine", href: "/sujets?onglet=nouveautes", phrase: "Garder ou écarter les nouveautés de la semaine, chacune avec sa source." },
  { code: "commenter.allume", nom: "Ma communauté", href: "/commenter", phrase: "Voir chaque jour sept comptes chez qui laisser un commentaire. Rien n'est envoyé à votre place." },
  { code: "lots", nom: "Mes vidéos", href: "/lots", phrase: "Commander des vidéos et suivre chacune, de « à coller dans le studio » jusqu'à « publiée »." },
  { code: "metiers", nom: "Mes métiers", href: "/sujets", phrase: "Choisir les métiers dont vos vidéos parlent : allumer, éteindre ou valider chacun." },
  { code: "mots", nom: "Mots et messages", href: "/mots", phrase: "Garder les mots à commenter, les messages envoyés et leurs cadeaux au même endroit." },
  { code: "chiffres", nom: "Demandes reçues", href: "/mots?onglet=demandes", phrase: "Noter chaque semaine les demandes reçues pour chaque mot et voir ce que chaque compte rapporte." },
  { code: "agregats.ecran", nom: "Mots en commentaire", href: "/mots?onglet=agregats", phrase: "Voir, pour chaque mot, les demandes reçues, les e-mails confirmés et les guides envoyés, jour par jour et compte par compte. Lecture seule." },
  { code: "bases.recharger", nom: "Bases", href: "/reglages/bases", phrase: "Relire les fichiers des bases pour mettre à jour vos métiers et vos sujets. Elles se rechargent aussi seules au démarrage." },
  { code: "opposition", nom: "Personnes qui ont dit STOP", href: "/reglages/oppositions", phrase: "Noter à la main une personne qui ne veut plus rien recevoir." },
];

export const CODES_ECRANS: readonly string[] = ECRANS_ALLUMABLES.map((e) => e.code);

export function ecranParCode(code: string): EcranAllumable | undefined {
  return ECRANS_ALLUMABLES.find((e) => e.code === code);
}

/** Une phrase simple pour les interrupteurs qui ne sont pas des écrans (cartes de « Ma journée », choix des vidéos, texte à coller). */
const PHRASES_AUTRES: Record<string, string> = {
  tirage: "Choisit les vidéos d'une commande sans jamais refaire un contenu déjà commandé ou déjà fabriqué.",
  "tirage.fin-rendez-vous": "Permet de choisir, pour une vidéo, une fin qui invite à réserver un rendez-vous.",
  "lots.paquet": "Montre, pour chaque vidéo, le texte à coller dans le studio.",
  "ma-journee.metiers-sans-contenu": "Carte de Ma journée : les métiers allumés qui n'ont encore aucun contenu.",
  "ma-journee.nouveautes": "Carte de Ma journée : les nouveautés qu'il reste à garder ou à écarter.",
  "ma-journee.a-faire-par-vous": "Carte de Ma journée : les vidéos prêtes à coller dans le studio.",
  "ma-journee.calendrier-trou": "Carte de Ma journée : un réseau qui n'a pas assez de publications prévues cette semaine.",
  "ma-journee.commentaires-linkedin": "Carte de Ma journée : un rappel après une publication LinkedIn prévue.",
  "ma-journee.releve-mot": "Carte de Ma journée : le rappel hebdomadaire de noter les chiffres de chaque mot.",
};

export function phraseDeInterrupteur(code: string, repli: string | null): string | null {
  return ecranParCode(code)?.phrase ?? PHRASES_AUTRES[code] ?? repli;
}
