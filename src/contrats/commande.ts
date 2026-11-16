/** U-COMMANDE · échanges avec la porte du Studio (version 2) : proposer une ligne du calendrier (appel 1), relire son état (appel 2). */
import { z } from "zod";
import { reseau } from "./identifiants";

export const ETATS_COMMANDE_STUDIO = ["recue", "mise_de_cote", "a_valider", "programmee", "publiee", "refusee", "echec", "manquee", "archivee"] as const;
export const etatCommandeStudio = z.enum(ETATS_COMMANDE_STUDIO);
export type EtatCommandeStudio = z.infer<typeof etatCommandeStudio>;

export const ETATS_ENVOI_COMMANDE = ["a_envoyer", "envoyee", "mise_de_cote_studio", "non_envoyee"] as const;
export type EtatEnvoiCommande = (typeof ETATS_ENVOI_COMMANDE)[number];

/** Identifiant `valide_par` qu'utilisera RC-17 (compte unique, jamais une adresse). */
export const COMPTE_USINE = "compte-usine";

const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instantUtc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

/** Corps de l'appel 1 : aucun autre champ (le Studio refuse tout champ inconnu). */
export const corpsCommandeStudio = z.strictObject({
  contrat: z.literal(2),
  cle: z.string().regex(/^[A-Za-z0-9._:-]{8,100}$/),
  reseau,
  jour,
  instant: instantUtc,
  compteCible: z.string().min(1).max(200),
  repere: z.string().min(1).max(200).optional(),
});
export type CorpsCommandeStudio = z.infer<typeof corpsCommandeStudio>;

export const reponseCommandeStudio = z.object({ etat: z.enum(["recue", "mise_de_cote"]), deja: z.boolean() });

/** Lecture tolérante : un champ en plus est ignoré, jamais recopié. */
export const lectureCommandeStudio = z.object({
  etat: etatCommandeStudio,
  jour,
  instant: instantUtc.optional(),
  valideeLe: instantUtc.optional(),
  refuseLe: instantUtc.optional(),
});

export const erreurPorte = z.object({ erreur: z.string(), code: z.string() });
