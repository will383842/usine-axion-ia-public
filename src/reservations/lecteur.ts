/** UO-07 · Lecture des réservations du site : seulement des nombres par lien de suivi et par semaine. Aucun appel réseau ici : l'appel est passé par l'appelant (une passerelle, plus tard ; une doublure dans les essais). */
import { z } from "zod";

/** Une réponse qui porte autre chose que ces trois champs (nom, e-mail, téléphone…) est rejetée en entier. */
export const schemaReservations = z.strictObject({
  reservations: z.array(
    z.strictObject({
      lien: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
      semaine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      nombre: z.number().int().min(0).max(1_000_000),
    }),
  ),
});
export type LigneReservations = z.infer<typeof schemaReservations>["reservations"][number];

export interface DemandeSite {
  /** En-têtes à envoyer : le jeton voyage en en-tête, jamais dans l'adresse. */
  entetes: Record<string, string>;
}
export type AppelSite = (demande: DemandeSite) => Promise<{ statut: number; corps: unknown }>;

export type LectureReservations = { etat: "pas-de-donnee" } | { etat: "ok"; lignes: LigneReservations[] };

/** Site injoignable, 401, réponse refusée ou jeton absent : « pas de donnée », jamais zéro. */
export async function lireReservationsDuSite(appeler: AppelSite | null, jeton: string | undefined): Promise<LectureReservations> {
  if (!appeler || !jeton) return { etat: "pas-de-donnee" };
  try {
    const reponse = await appeler({ entetes: { authorization: `Bearer ${jeton}` } });
    if (reponse.statut !== 200) return { etat: "pas-de-donnee" };
    const lu = schemaReservations.safeParse(reponse.corps);
    return lu.success ? { etat: "ok", lignes: lu.data.reservations } : { etat: "pas-de-donnee" };
  } catch {
    return { etat: "pas-de-donnee" };
  }
}
