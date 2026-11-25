/** Réserve de tutoriels · échanges avec la porte du Studio (version 2) : prendre le suivant (`usine/tutoriels`), suivre sa fabrication (`usine/tutoriels/{cle}`). */
import { z } from "zod";

export const ETATS_TIRAGE_TUTORIEL = ["demande", "pris", "echec"] as const;
export type EtatTirageTutoriel = (typeof ETATS_TIRAGE_TUTORIEL)[number];

export const ETATS_STUDIO_TUTORIEL = ["pris", "fait", "a_revoir", "refusee", "en_reserve"] as const;
export type EtatStudioTutoriel = (typeof ETATS_STUDIO_TUTORIEL)[number];

/** Raisons d'attente connues du Studio (liste ouverte : une raison inconnue est lue comme une attente). `bail_occupe` : un autre tirage tient le bail. */
export const RAISONS_ATTENTE_TUTORIEL = ["bail_occupe"] as const;

/** `cle` côté Studio : `[A-Za-z0-9._:-]{8,94}` ; côté Usine, sans point ni deux-points (le chemin de la passerelle n'en veut pas). */
export const cleTirageTutoriel = z.string().regex(/^[a-z0-9-]{8,94}$/);
const identifiantVideo = z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/);

/** Corps de l'appel « prendre le suivant » : aucun autre champ (le Studio refuse tout champ inconnu). */
export const corpsTirageTutoriel = z.strictObject({
  contrat: z.literal(2),
  cle: cleTirageTutoriel,
  source: z.literal("reserve"),
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type CorpsTirageTutoriel = z.infer<typeof corpsTirageTutoriel>;

/** Lecture tolérante : un champ en plus est ignoré, jamais recopié ; un `videoId` mal formé vaut « absent ». */
export const reponseTirageTutoriel = z.discriminatedUnion("etat", [
  z.object({ etat: z.literal("pris"), deja: z.boolean().optional(), elementId: z.string().min(1).max(200), videoId: identifiantVideo.optional().catch(undefined) }),
  z.object({ etat: z.literal("reserve_vide") }),
  z.object({ etat: z.literal("attente"), raison: z.string().max(100).optional() }),
  z.object({ etat: z.literal("eteint") }),
  z.object({ etat: z.literal("echec"), elementId: z.string().min(1).max(200), retourEnReserve: z.boolean().optional() }),
]);
export type ReponseTirageTutoriel = z.infer<typeof reponseTirageTutoriel>;

/** Suivi d'un tirage : `aValider: true` est le seul feu vert pour poser le créneau. */
export const lectureTirageTutoriel = z.object({
  etat: z.enum(ETATS_STUDIO_TUTORIEL),
  elementId: z.string().min(1).max(200),
  videoId: identifiantVideo.optional().catch(undefined),
  aValider: z.boolean(),
});
export type LectureTirageTutoriel = z.infer<typeof lectureTirageTutoriel>;
