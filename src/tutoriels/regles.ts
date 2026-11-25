/** Réserve de tutoriels · règles pures : clés, lundi visé, lecture des réponses du Studio, choix du créneau. Ni base ni réseau. */
import { ajouterJours, lundiDe, parSemaine } from "@/calendrier/regles";
import { cleTirageTutoriel, lectureTirageTutoriel, reponseTirageTutoriel, type EtatStudioTutoriel, type Reseau } from "@/contrats";
import { jourParis, proposerSemaine, type LigneSemaine, type Occupe } from "@/planification/regles";
import type { RythmesParReseau } from "@/reglages/modele";
import type { QuotasParReseau } from "@/reglages/quotas";

export const INTERRUPTEUR_TUTORIEL = "tutoriel.reserve";
export const RESEAU_TUTORIEL: Reseau = "instagram";
export const ESSAIS_MAX_PAR_SEMAINE = 2;
export const MINUTES_ENTRE_DEMANDES = 60;
export const MINUTES_ENTRE_RELECTURES = 30;
export const RELECTURES_MAX = 10;
export const ID_LIGNE_TUTORIEL = "v-tutoriel";
export const NOTE_LIGNE_TUTORIEL = "Tutoriel de la réserve";

const CHEMIN_PASSERELLE = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i;
const CLE_STUDIO = /^[A-Za-z0-9._:-]{8,94}$/;

/** Clé d'un tirage : `tuto-<lundi>-<essai>` (lettres minuscules, chiffres et tirets : la passerelle refuse le point). Écrite en base AVANT l'appel. */
export function cleTutoriel(lundi: string, essai: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lundi) || !Number.isInteger(essai) || essai < 1) throw new Error("clé de tutoriel mal formée");
  const cle = `tuto-${lundi}-${essai}`;
  if (!cleTirageTutoriel.safeParse(cle).success || !CLE_STUDIO.test(cle) || !CHEMIN_PASSERELLE.test(`usine/tutoriels/${cle}`)) throw new Error("clé de tutoriel mal formée");
  return cle;
}

/** Le lundi SUIVANT (heure de Paris) : le dimanche soir comme tout autre jour, c'est le lendemain ou le lundi d'après. */
export const lundiCible = (maintenant: Date): string => ajouterJours(lundiDe(jourParis(maintenant)), 7);

export type ReponseTirage = { genre: "pris"; elementId: string; videoId?: string; deja: boolean } | { genre: "echec"; elementId: string } | { genre: "rejouer"; raison: string };

/** Réponse de « prendre le suivant » : tout ce qui n'est pas un 200 compris est à rejouer (même clé), sauf `echec` (nouvelle clé). */
export function lireReponseTirage(statut: number, corps: unknown): ReponseTirage {
  if (statut !== 200) return { genre: "rejouer", raison: `statut_${statut}` };
  const lu = reponseTirageTutoriel.safeParse(corps);
  if (!lu.success) return { genre: "rejouer", raison: "illisible" };
  const r = lu.data;
  if (r.etat === "pris") return { genre: "pris", elementId: r.elementId, deja: r.deja === true, ...(r.videoId ? { videoId: r.videoId } : {}) };
  if (r.etat === "echec") return { genre: "echec", elementId: r.elementId };
  if (r.etat === "attente") return { genre: "rejouer", raison: r.raison ? `attente_${r.raison}`.slice(0, 100) : "attente" };
  return { genre: "rejouer", raison: r.etat };
}

export type ReponseSuivi =
  | { genre: "en_cours"; etat: "pris" | "fait"; videoId?: string }
  | { genre: "a_valider"; videoId: string }
  | { genre: "perdu"; etat: Extract<EtatStudioTutoriel, "a_revoir" | "en_reserve"> }
  | { genre: "rejouer" };

/** Réponse du suivi : `aValider: true` sans `videoId` n'est pas un feu vert (on relit plus tard). */
export function lireReponseSuivi(statut: number, corps: unknown): ReponseSuivi {
  if (statut !== 200) return { genre: "rejouer" };
  const lu = lectureTirageTutoriel.safeParse(corps);
  if (!lu.success) return { genre: "rejouer" };
  const r = lu.data;
  if (r.etat === "a_revoir" || r.etat === "en_reserve") return { genre: "perdu", etat: r.etat };
  if (r.aValider) return r.videoId ? { genre: "a_valider", videoId: r.videoId } : { genre: "rejouer" };
  return { genre: "en_cours", etat: r.etat, ...(r.videoId ? { videoId: r.videoId } : {}) };
}

export interface EntreesCreneauTutoriel {
  lundi: string;
  reseau: Reseau;
  compte: string;
  /** Lignes réelles de la semaine (calendrier). */
  lignes: LigneSemaine[];
  rythmes: RythmesParReseau;
  quotas: QuotasParReseau;
  occupes: Occupe[];
  maintenant: Date;
}

/** Le créneau d'un tutoriel (une ligne virtuelle vidéo passée à `proposerSemaine`, mêmes règles que la semaine proposée), ou `null`. YouTube est refusé. */
export function creneauTutoriel(e: EntreesCreneauTutoriel): { jour: string; instant: Date } | null {
  if (e.reseau === "youtube" || e.reseau === "youtube-shorts") return null;
  const virtuelle: LigneSemaine = { id: ID_LIGNE_TUTORIEL, reseau: e.reseau, compte: e.compte, type_contenu: "video", instant: new Date(0), fixe: false };
  const { propositions } = proposerSemaine({ lundi: e.lundi, lignes: [...e.lignes, virtuelle], rythmes: e.rythmes, quotas: e.quotas, occupes: e.occupes, maintenant: e.maintenant, etaler: true });
  const p = propositions.find((x) => x.ligne === ID_LIGNE_TUTORIEL);
  return p ? { jour: p.jour, instant: p.instant } : null;
}

/** Les rythmes avec une place vidéo de moins pour le réseau du tutoriel (pour les créneaux virtuels seulement, jamais pour `proposerSemaine`). */
export function rythmesSansTutoriel(rythmes: RythmesParReseau): RythmesParReseau {
  const r = rythmes[RESEAU_TUTORIEL];
  if (parSemaine(r) <= 0) return rythmes;
  return { ...rythmes, [RESEAU_TUTORIEL]: { min: Math.max(0, r.min - 1), max: Math.max(0, r.max - 1) } };
}

