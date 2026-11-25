/** PLAFOND-USINE-a · plafond des achats automatiques : échange avec la porte du Studio (PUT /api/usine/reglages/budget). */
import { z } from "zod";

/** Borne haute du plafond saisi dans l'Usine, en centimes. La relever est une fiche relue par l'auditeur argent. */
export const PLAFOND_AUTO_MAX_CENTS = 10_000;

/**
 * Corps strict : l'état d'autonomie (allumé ou éteint) et son plafond. Aucun autre champ (ni quotas, ni budget, ni mois).
 * « Allumé » exige un plafond supérieur à 0. Ordre écrit du fondateur du 25/11 (« oui sur l'autonomie de l'usine »,
 * « ok pour 20€ MAIS il faudrait que je puisse changer le montant directement dans la console de l'usine par l'UI »).
 */
export const corpsPlafondStudio = z
  .strictObject({
    contrat: z.literal(2),
    automatique: z.boolean(),
    plafond_automatique_cents: z.number().int().min(0).max(PLAFOND_AUTO_MAX_CENTS),
  })
  .refine((c) => !c.automatique || c.plafond_automatique_cents > 0, { message: "allumer exige un plafond supérieur à 0" });
export type CorpsPlafondStudio = z.infer<typeof corpsPlafondStudio>;

/** Lecture tolérante : les autres champs (dont le plafond global du Studio) sont ignorés, jamais recopiés. */
export const reponsePlafondStudio = z
  .object({
    automatique: z.boolean(),
    plafond_automatique_cents: z.number().int(),
    deja: z.boolean(),
  })
  .refine((r) => !r.automatique || r.plafond_automatique_cents > 0, { message: "allumé avec 0" });
export type ReponsePlafondStudio = z.infer<typeof reponsePlafondStudio>;

/** Lecture de l'état au Studio (POST /api/usine/reglages/autonomie, lecture seule). Tolérante : les autres champs sont ignorés. */
export const reponseAutonomieStudio = z.object({
  automatique: z.boolean(),
  plafond_automatique_cents: z.number().int().min(0),
  utilise_automatique_cents: z.number().int().min(0),
  mois: z.string().min(1),
  pilote: z.enum(["usine", "studio", "aucun"]),
});
export type ReponseAutonomieStudio = z.infer<typeof reponseAutonomieStudio>;

export const RAISONS_PLAFOND = ["hors_bornes", "arret", "pas_branche", "sans_reponse", "refuse", "reponse_inattendue"] as const;
export type RaisonPlafond = (typeof RAISONS_PLAFOND)[number];
export type ResultatPlafond = { ok: true; actif: boolean; plafond_cents: number; deja: boolean } | { ok: false; raison: RaisonPlafond; statut?: number };
