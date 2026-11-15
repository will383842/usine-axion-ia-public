/** UO-07 · Réservations du site, derrière l'interrupteur « reservations » (éteint par défaut : aucun appel). */
import "server-only";
import { interrupteurAllume } from "@/donnees";
import { lireReservationsDuSite, type AppelSite, type LectureReservations } from "./lecteur";

export * from "./lecteur";
export const INTERRUPTEUR_RESERVATIONS = "reservations";

export type ReservationsLues = { etat: "eteint" } | LectureReservations;

export async function lireReservations(appeler: AppelSite | null = null): Promise<ReservationsLues> {
  if (!(await interrupteurAllume(INTERRUPTEUR_RESERVATIONS))) return { etat: "eteint" };
  return lireReservationsDuSite(appeler, process.env.RESERVATIONS_JETON);
}
