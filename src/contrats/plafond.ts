/** PLAFOND-USINE-a · plafond des achats automatiques : échange avec la porte du Studio (PUT /api/usine/reglages/budget). */
import { z } from "zod";

/** Borne haute du plafond saisi dans l'Usine, en centimes. La relever est une fiche relue par l'auditeur argent. */
export const PLAFOND_AUTO_MAX_CENTS = 10_000;

/** Corps strict : l'état d'autonomie est toujours éteint, jamais autre chose. Aucun autre champ (ni quotas, ni budget, ni mois). */
export const corpsPlafondStudio = z.strictObject({
  contrat: z.literal(2),
  automatique: z.literal(false),
  plafond_automatique_cents: z.number().int().min(0).max(PLAFOND_AUTO_MAX_CENTS),
});
export type CorpsPlafondStudio = z.infer<typeof corpsPlafondStudio>;

/** Lecture tolérante : les autres champs (dont le plafond global du Studio) sont ignorés, jamais recopiés. */
export const reponsePlafondStudio = z.object({
  automatique: z.literal(false),
  plafond_automatique_cents: z.number().int(),
  deja: z.boolean(),
});
export type ReponsePlafondStudio = z.infer<typeof reponsePlafondStudio>;

export const RAISONS_PLAFOND = ["hors_bornes", "arret", "pas_branche", "sans_reponse", "refuse", "reponse_inattendue"] as const;
export type RaisonPlafond = (typeof RAISONS_PLAFOND)[number];
export type ResultatPlafond = { ok: true; plafond_cents: number; deja: boolean } | { ok: false; raison: RaisonPlafond; statut?: number };
