/**
 * CONTRATS-ECHANGE.md § 1 · Identifiants communs, traduits en schémas zod.
 * Aucun nom hors du contrat : un changement = une ligne ajoutée au contrat d'abord, puis ici.
 */
import { z } from "zod";

/** `secteur.code` : slug à tirets bas (`btp_immobilier`), plus `generaliste` et `hors_site`. */
export const codeSecteur = z.string().regex(/^[a-z][a-z0-9_]*$/);

/** `metier.code` : `<préfixe>.<slug>` (`compta.expert-comptable`). */
export const codeMetier = z.string().regex(/^[a-z0-9_-]+\.[a-z0-9-]+$/);

export const CODES_PUBLIC = ["public.clients", "public.apporteurs", "public.formateurs"] as const;
export const codePublic = z.enum(CODES_PUBLIC);
export type CodePublic = z.infer<typeof codePublic>;

export const CODES_TAILLE = ["TPE", "PME", "ETI", "GE"] as const;
export const codeTaille = z.enum(CODES_TAILLE);
export type CodeTaille = z.infer<typeof codeTaille>;

/** `service.code` (Usine). Au studio, `integration` s'appelle `automatisations` (série). */
export const CODES_SERVICE = ["formation", "audit", "coaching", "integration"] as const;
export const codeService = z.enum(CODES_SERVICE);
export type CodeService = z.infer<typeof codeService>;

/** Passage Usine → série du studio. */
export const SERIE_STUDIO: Record<CodeService, SerieStudio> = {
  formation: "formation",
  audit: "audit",
  coaching: "coaching",
  integration: "automatisations",
};
export const SERIES_STUDIO = ["formation", "audit", "automatisations", "coaching"] as const;
export const serieStudio = z.enum(SERIES_STUDIO);
export type SerieStudio = z.infer<typeof serieStudio>;

/** `douleur.code` `<metier>.dN` · `objection.code` `<metier>.oN` · `souci.code` `<metier>.sNN`. */
export const codeDouleur = z.string().regex(/^[a-z0-9_-]+\.[a-z0-9-]+\.d[0-9]+$/);
export const codeObjection = z.string().regex(/^[a-z0-9_-]+\.[a-z0-9-]+\.o[0-9]+$/);
export const codeSouci = z.string().regex(/^[a-z0-9_-]+\.[a-z0-9-]+\.s[0-9]+$/);

/** `cas_usage.code` : `<metier>.<service>.cNN` ou `<metier>.phare.pN`. */
export const codeCasUsage = z.string().regex(/^[a-z0-9_-]+\.[a-z0-9-]+\.((formation|audit|coaching|integration)\.c[0-9]+|phare\.p[0-9]+)$/);

/** `famille.code` `A`…`G` · `sujet.code` `<famille>.<slug>` (`a.integration`). */
export const codeFamille = z.string().regex(/^[A-G]$/);
export const codeSujet = z.string().regex(/^[a-g]\.[a-z0-9_-]+$/);

/** `actualite.code` : `actu.<AAAA-MM-JJ>.<n>`. */
export const codeActualite = z.string().regex(/^actu\.\d{4}-\d{2}-\d{2}\.\d+$/);

/** `interdit.code` · `fait.code` · `voix.code` · `accroche.code`. */
export const codeInterdit = z.string().regex(/^interdit\.[a-z0-9_-]+$/);
export const codeFait = z.string().regex(/^fait\.[a-z0-9_-]+$/);
export const codeVoix = z.string().regex(/^voix\.[a-z0-9_-]+$/);
export const codeAccroche = z.string().regex(/^accroche\.[a-z0-9_-]+$/);

/** `format.id` : identifiant du studio (`tableau-anime`, `facecam`, `cas-concret`). */
export const formatId = z.string().regex(/^[a-z][a-z0-9-]*$/);
/** `format.code` : 2 ou 3 majuscules (`TB`, `FC`, `AV`, `EP`, `CC`). */
export const formatCode = z.string().regex(/^[A-Z]{2,3}$/);
/** `format_autre.code` : `legende`, `carrousel`, `story`, `message_prive_1`, `email_suite`… */
export const formatAutreCode = z.string().regex(/^[a-z][a-z0-9_]*$/);

/** `type_contenu` : toute table qui parle d'un contenu le porte. */
export const TYPES_CONTENU = ["video", "carrousel", "image", "texte", "story"] as const;
export const typeContenu = z.enum(TYPES_CONTENU);
export type TypeContenu = z.infer<typeof typeContenu>;

/** `reseau.code` : `IdReseau` du studio. */
export const RESEAUX = ["linkedin", "instagram", "facebook", "tiktok", "youtube", "youtube-shorts"] as const;
export const reseau = z.enum(RESEAUX);
export type Reseau = z.infer<typeof reseau>;

/** `compte.code` : `<reseau>:<identifiant public en minuscules>` ; `nature` = profil · page · compte. */
export const codeCompte = z.string().regex(/^(linkedin|instagram|facebook|tiktok|youtube|youtube-shorts):[a-z0-9._-]+$/);
export const NATURES_COMPTE = ["profil", "page", "compte"] as const;
export const natureCompte = z.enum(NATURES_COMPTE);
export type NatureCompte = z.infer<typeof natureCompte>;

/** `appel.code` : `fin-<groupe>-<slug>` (base 7, repris tel quel par le studio). */
export const codeAppel = z.string().regex(/^fin-[a-z0-9]+-[a-z0-9-]+$/);
export const TYPES_APPEL = ["abonnement", "enregistrement", "envoi", "question", "commentaire", "cadeau", "rendez-vous", "lien"] as const;
export const typeAppel = z.enum(TYPES_APPEL);
export type TypeAppel = z.infer<typeof typeAppel>;
export const OBJECTIFS_APPEL = ["MOT_CADEAU", "LIEN_PROFIL", "QUESTION", "ENREGISTRER", "PARTAGER", "ABONNEMENT", "RENDEZ_VOUS", "CANDIDATURE"] as const;
export const objectifAppel = z.enum(OBJECTIFS_APPEL);
export type ObjectifAppel = z.infer<typeof objectifAppel>;

/** `version.code` : `0042-AV-TT` (suffixes du studio). */
export const codeVersion = z.string().regex(/^\d{4}-[A-Z]{2,3}(-[A-Z0-9]+)*$/);

/** `cas_concret.code` : minuscules avec tirets (`rappels-rendez-vous`). */
export const codeCasConcret = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** `mot.code` : `mot-<mot en minuscules>` (`mot-guide`). */
export const codeMot = z.string().regex(/^mot-[a-z0-9-]+$/);

/** `cadeau.code` : valeur de `GuideRequest.aimant` du site (`guide-ia`) ; document promis : `structure-<cas_concret.code>`. */
export const codeCadeau = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** `lot.id` `L<n>` · `lot_ligne.id` `L<n>-<m>`. */
export const idLot = z.string().regex(/^L[1-9][0-9]*$/);
export const idLotLigne = z.string().regex(/^L[1-9][0-9]*-[1-9][0-9]*$/);

/** `repere` : `usine:L12-3`, dans le sujet du paquet seulement, jamais dans un lien. */
export const repere = z.string().regex(/^usine:L[1-9][0-9]*-[1-9][0-9]*$/);
export function repereDe(idLigne: string): string {
  return `usine:${idLotLigne.parse(idLigne)}`;
}

/** `refus.code` : six raisons, tenues dans l'Usine (table `refus`, migration 001). */
export const CODES_REFUS = ["hors_cible", "deja_vu", "faux_ou_douteux", "accroche_faible", "voix_ou_rythme", "image"] as const;
export const codeRefus = z.enum(CODES_REFUS);
export type CodeRefus = z.infer<typeof codeRefus>;

/** `etat` des bases (et de tout ce qui se valide dans l'Usine). « à valider » à l'écran = `propose`. */
export const ETATS = ["brouillon", "propose", "valide", "retire"] as const;
export const etat = z.enum(ETATS);
export type Etat = z.infer<typeof etat>;

/** `origine` des bases (contrat § 2). */
export const ORIGINES = ["repris", "propose"] as const;
export const origine = z.enum(ORIGINES);
export type Origine = z.infer<typeof origine>;

/** États d'une ligne de lot (PLAN-EXECUTION T09) : à coller · collée · fabriquée · publiée · refusée. */
export const ETATS_LOT_LIGNE = ["a_coller", "collee", "fabriquee", "publiee", "refusee"] as const;
export const etatLotLigne = z.enum(ETATS_LOT_LIGNE);
export type EtatLotLigne = z.infer<typeof etatLotLigne>;
