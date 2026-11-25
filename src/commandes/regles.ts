/** U-COMMANDE · règles pures : clé, corps de l'appel 1, lecture des réponses. Ni base ni réseau. */
import { createHash } from "crypto";
import {
  corpsCommandeStudio,
  lectureCommandeStudio,
  reponseCommandeStudio,
  type CorpsCommandeStudio,
  type EtatCommandeStudio,
  type EtatEnvoiCommande,
} from "@/contrats";

export const INTERRUPTEUR_COMMANDES = "commandes.studio";
export const LECTURES_MAX = 20;

export const PHRASE_ETEINT = "Les échanges avec le Studio sont éteints.";
export const PHRASE_ARRET = "Tout est arrêté.";
export const PHRASE_PAS_BRANCHE = "Le Studio n'est pas encore branché : rien n'est parti.";
export const PHRASE_SANS_REPONSE = "Le Studio ne répond pas pour l'instant.";
export const PHRASE_INTROUVABLE_CHEZ_STUDIO = "Le Studio ne trouve plus cette commande.";

export interface LigneAProposer {
  id: string;
  reseau: string;
  compte: string | null;
  type_contenu: string;
  prevue_le: Date;
  lot_ligne: string | null;
  /** Seulement pour une ligne née d'un tutoriel validé de la réserve. */
  video_id?: string | null;
}

/** SHA-256 hexadécimal de « usine|calendrier_ligne|<id> » : stable pour une même ligne. */
export const cleCommande = (calendrierLigneId: string) => createHash("sha256").update(`usine|calendrier_ligne|${calendrierLigneId}`).digest("hex");

/** Jour civil de Paris (AAAA-MM-JJ) d'un instant. */
export const jourDeParis = (instant: Date) => instant.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export type CorpsOuRefus = { ok: true; corps: CorpsCommandeStudio } | { ok: false; phrase: string };

/** Corps strict de l'appel 1, ou refus local avec une phrase (aucun appel n'a lieu). */
export function corpsDeLigne(ligne: LigneAProposer, maintenant: Date): CorpsOuRefus {
  if (ligne.reseau === "youtube" || ligne.reseau === "youtube-shorts") return { ok: false, phrase: "YouTube est éteint pour l'instant." };
  if (!ligne.compte) return { ok: false, phrase: "Choisissez d'abord le compte." };
  if (ligne.prevue_le.getTime() <= maintenant.getTime()) return { ok: false, phrase: "Cette date est passée : changez de jour." };
  const lu = corpsCommandeStudio.safeParse({
    contrat: 2,
    cle: cleCommande(ligne.id),
    reseau: ligne.reseau,
    jour: jourDeParis(ligne.prevue_le),
    instant: ligne.prevue_le.toISOString(),
    compteCible: ligne.compte,
    ...(ligne.lot_ligne ? { repere: `usine:${ligne.lot_ligne}` } : {}),
    ...(ligne.video_id ? { videoId: ligne.video_id } : {}),
  });
  return lu.success ? { ok: true, corps: lu.data } : { ok: false, phrase: "Cette ligne n'est pas prête à être proposée." };
}

export interface IssueEnvoi {
  etat_envoi: EtatEnvoiCommande;
  etat_studio: EtatCommandeStudio | null;
  message: string;
}

const REFUS: Record<number, string> = {
  400: "Le Studio a refusé cette demande : vérifiez le réseau, le compte et la date.",
  401: "Le Studio n'a pas reconnu l'Usine : la clé d'échange est à revoir sur le serveur.",
  404: "Le Studio n'est pas prêt à recevoir cette demande.",
  423: "Le Studio est à l'arrêt.",
  426: "Le Studio attend une version plus récente de l'échange : rien n'est parti.",
  429: "Le Studio reçoit trop de demandes : réessayez dans une minute.",
};
const PHRASE_PANNE = "Le Studio a eu un souci : réessayez plus tard.";
const PHRASE_INATTENDUE = "La réponse du Studio n'est pas comprise : rien n'est noté comme envoyé.";

/** Réponse de l'appel 1 → état d'envoi, état du Studio et phrase pour le fondateur (jamais de code ni de détail technique). */
export function lireReponseCommande(statut: number, corps: unknown): IssueEnvoi {
  const non = (message: string): IssueEnvoi => ({ etat_envoi: "non_envoyee", etat_studio: null, message });
  if (statut === 200 || statut === 201 || statut === 202) {
    const lu = reponseCommandeStudio.safeParse(corps);
    if (!lu.success) return non(PHRASE_INATTENDUE);
    if (statut === 202 || lu.data.etat === "mise_de_cote") {
      return {
        etat_envoi: "mise_de_cote_studio",
        etat_studio: "mise_de_cote",
        message: "Le Studio a mis cette commande de côté (une par réseau et par jour) : vous la débloquez dans le Studio.",
      };
    }
    return { etat_envoi: "envoyee", etat_studio: "recue", message: "Reçue par le Studio." };
  }
  return non(REFUS[statut] ?? PHRASE_PANNE);
}

export interface LectureRecopiee {
  etat_studio: EtatCommandeStudio;
  valide_le: Date | null;
  refuse_le: Date | null;
}

/** Réponse de l'appel 2 → ce qu'on recopie, ou `null` (l'état précédent est gardé). */
export function lireReponseLecture(statut: number, corps: unknown): LectureRecopiee | null {
  if (statut !== 200) return null;
  const lu = lectureCommandeStudio.safeParse(corps);
  if (!lu.success) return null;
  return {
    etat_studio: lu.data.etat,
    valide_le: lu.data.valideeLe ? new Date(lu.data.valideeLe) : null,
    refuse_le: lu.data.refuseLe ? new Date(lu.data.refuseLe) : null,
  };
}

export const LIBELLE_ETAT_STUDIO: Record<EtatCommandeStudio, string> = {
  recue: "Reçue par le Studio",
  mise_de_cote: "Mise de côté par le Studio",
  a_valider: "À valider",
  programmee: "Programmée",
  publiee: "Publiée",
  refusee: "Refusée",
  echec: "Le Studio n'a pas pu la publier",
  manquee: "Date manquée",
  archivee: "Archivée dans le Studio",
};
