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
  videoId: z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/).optional(),
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

/** RC-17 · « À valider » : appel 2 bis (lecture du contenu fini d'un créneau) et appel 3 (geste du fondateur). */
export const REFUS_CODES = ["hors_cible", "deja_vu", "faux_ou_douteux", "accroche_faible", "voix_ou_rythme", "image"] as const;
export const refusCode = z.enum(REFUS_CODES);
export type RefusCode = z.infer<typeof refusCode>;

const empreinte = z.string().regex(/^[0-9a-f]{64}$/);
const identifiantMedia = z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/);

/** Appel 2 bis, lecture tolérante : un champ en plus est ignoré, jamais recopié. */
export const aValiderStudio = z.object({
  etape: z.literal("video"),
  etat: etatCommandeStudio,
  reseau,
  jour,
  instant: instantUtc,
  compteCible: z.string().min(1).max(200),
  media: z.object({ type: z.enum(["video", "visuel"]), id: identifiantMedia }).nullable(),
  textes: z.object({ texte: z.string(), premierCommentaire: z.string() }).nullable(),
  empreinte,
  valideeLe: instantUtc.optional(),
});
export type AValiderStudio = z.infer<typeof aValiderStudio>;

/** Appel 3 : corps strict ; `refus_code` et `note` seulement pour un refus. */
export const corpsValidationStudio = z
  .strictObject({
    contrat: z.literal(2),
    etape: z.literal("video"),
    decision: z.enum(["valide", "refuse"]),
    empreinte,
    valide_par: z.literal(COMPTE_USINE),
    valide_le: instantUtc,
    refus_code: refusCode.optional(),
    note: z.string().min(1).max(300).regex(/^[^\r\n]+$/).optional(),
  })
  .refine((c) => (c.decision === "refuse" ? c.refus_code !== undefined : c.refus_code === undefined && c.note === undefined));
export type CorpsValidationStudio = z.infer<typeof corpsValidationStudio>;

export const reponseValidationStudio = z.object({
  etat: z.enum(["a_valider", "refusee"]),
  valideeLe: instantUtc.optional(),
  refuseLe: instantUtc.optional(),
  deja: z.boolean(),
});
export type ReponseValidationStudio = z.infer<typeof reponseValidationStudio>;
