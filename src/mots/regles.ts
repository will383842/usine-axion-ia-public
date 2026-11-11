/** Règles du registre des mots (T04) : pures, sans base, pour être essayées seules. */
import { RESEAUX_MOT } from "@/contrats";

export type ReseauMot = (typeof RESEAUX_MOT)[number];

/** Instagram et Facebook seulement : TikTok, LinkedIn, YouTube ne sont jamais « branchés » (contrat § 7). */
export function reseauBranchable(reseau: string): reseau is ReseauMot {
  return (RESEAUX_MOT as readonly string[]).includes(reseau);
}

/** Un texte ne passe « en service » que s'il est validé. */
export function peutMettreEnService(texte: { etat: string }): boolean {
  return texte.etat === "valide";
}

/** Natures relues en entier avant d'être validées (« Je valide ce texte ») ; les autres passent par « Annuler » 10 s. */
export const NATURES_RELUES = ["premier_message", "message_lien"] as const;

export function relectureExigee(nature: string): boolean {
  return (NATURES_RELUES as readonly string[]).includes(nature);
}

export interface TexteRegle {
  reseau: string;
  etat: string;
  archive_le: Date | null;
}

/**
 * « Branché » = essai réussi (Will le constate), textes validés, automatisation ouverte au compte.
 * Ici : le réseau a au moins un texte et tous ceux qui le concernent (le sien et « tous ») sont validés.
 */
export function textesPretsPourBrancher(textes: readonly TexteRegle[], reseau: ReseauMot): boolean {
  const concernes = textes.filter((t) => !t.archive_le && t.etat !== "retire" && (t.reseau === reseau || t.reseau === "tous"));
  return concernes.some((t) => t.reseau === reseau) && concernes.every((t) => t.etat === "valide");
}

export interface LigneBranche {
  mot: string;
  reseau: string;
  compte: string;
  etat: string;
  archive_le?: Date | null;
}

/**
 * Le mot est-il branché sur ce compte (`<reseau>:<identifiant>`, ex. `instagram:williamsjullin`) ?
 * Une ligne au nom du compte l'emporte sur la ligne du réseau (compte vide = tous les comptes du réseau).
 * Rien de branché, réseau inconnu ou refusé (tiktok, linkedin, youtube…) : non.
 */
export function decider(lignes: readonly LigneBranche[], mot: string, compte: string): boolean {
  const [reseau, identifiant = ""] = compte.split(":");
  if (!reseauBranchable(reseau)) return false;
  const du_mot = lignes.filter((l) => !l.archive_le && l.mot.toUpperCase() === mot.toUpperCase() && l.reseau === reseau);
  const precise = du_mot.find((l) => identifiant !== "" && l.compte === identifiant);
  const ligne = precise ?? du_mot.find((l) => l.compte === "");
  return ligne?.etat === "branche";
}

export const NATURES: Record<string, string> = {
  premier_message: "Premier message",
  bouton: "Bouton",
  message_non_abonne: "Message si la personne n'est pas abonnée",
  message_lien: "Message avec le lien",
  reponse_publique: "Réponse sous le commentaire",
  stop: "Réponse à STOP",
  lien_message: "Lien · message privé",
  lien_profil: "Lien · profil",
  lien_commentaire: "Lien · commentaire",
};

export const NOMS_RESEAU: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  tous: "Tous les réseaux",
};
