/**
 * CONTRATS-ECHANGE.md §§ 2 à 8 · ce qui passe entre l'Usine, les bases, le studio et le site.
 */
import { z } from "zod";
import { codeAppel, codeCadeau, codeMot, idLotLigne, reseau, serieStudio } from "./identifiants";

// § 2 · Import des bases ------------------------------------------------------------------------

/** Les 20 tables des bases. `compte` n'est pas importée : les comptes réels sont tenus par l'Usine. */
export const TABLES_BASES = [
  "secteur", "metier", "public", "douleur", "objection", "souci_releve", "taille", "famille", "sujet", "actualite",
  "cas_usage", "format_video", "format_autre", "publication", "compte", "appel", "voix", "interdit", "fait", "accroche",
] as const;
export type TableBase = (typeof TABLES_BASES)[number];
export const TABLES_BASES_IMPORTEES = TABLES_BASES.filter((t) => t !== "compte") as Exclude<TableBase, "compte">[];

export const COLONNES_COMMUNES = ["code", "etat", "version", "origine", "source", "valide_le"] as const;
/** Tables qui portent `calcule` : la liste des champs remplis par calcul, jamais relus (à montrer à Will). */
export const TABLES_AVEC_CALCULE = ["metier", "douleur", "cas_usage"] as const;
/** Séparateur des listes dans les bases. */
export const SEPARATEUR_LISTE = ";";

export function lireListe(valeur: string | null | undefined): string[] {
  if (!valeur) return [];
  return valeur.split(SEPARATEUR_LISTE).map((x) => x.trim()).filter(Boolean);
}

// § 3 · Commande au studio, mode sans porte -------------------------------------------------------

export const RESEAUX_PAQUET = ["courts", "fil", "linkedin", "youtube"] as const;
export const reseauPaquet = z.enum(RESEAUX_PAQUET);

export const vraiCas = z
  .object({
    metier: z.string().max(120),
    tache: z.string().max(200),
    avant: z.string().max(400),
    apres: z.string().max(400),
    date: z.string().max(40),
  })
  .nullable();

/** Forme du mot pour le studio (`schemaDemandeScript`) : une seule chaîne de 2 à 20 lettres, chiffres ou tirets. */
export const FORME_MOT_STUDIO = /^[\p{L}\p{N}-]{2,20}$/u;

export const finPaquet = z.preprocess(
  // Lecture tolérante : un ancien paquet stocké avec le type « mot » vaut « commentaire ».
  (v) => (v && typeof v === "object" && (v as { type?: unknown }).type === "mot" ? { ...v, type: "commentaire" } : v),
  z.discriminatedUnion("type", [
    /** « Un mot à commenter », seulement si le mot est branché sur le compte (CONTRATS-ECHANGE § 3). */
    z.object({ type: z.literal("commentaire"), mot: z.string().regex(FORME_MOT_STUDIO) }),
    /** « Un appel de diagnostic ». */
    z.object({ type: z.literal("diagnostic") }),
  ]),
);

/** Le paquet que Will colle dans `/tableau/nouvelle` (`schemaDemandeScript` du studio). */
export const paquet = z.object({
  serie: serieStudio,
  sujet: z
    .string()
    .max(160)
    .regex(/^[^\n]*\[usine:L[1-9][0-9]*-[1-9][0-9]*\]$/, "Le sujet tient sur une ligne et finit par le repère entre crochets."),
  public: z.string().max(200),
  vraiCas,
  reseau: reseauPaquet,
  fin: finPaquet,
  envoi: z.string().max(300),
});
export type Paquet = z.infer<typeof paquet>;

/** Ce que l'Usine garde à côté du paquet. */
export const suiviPaquet = z.object({
  ligne: idLotLigne,
  fins: z.partialRecord(reseau, codeAppel),
  coutMaxEur: z.number().nonnegative(),
});

// § 4 · Lecture côté studio (saisie à la main en version 1) -----------------------------------------

export const ETATS_VIDEO_STUDIO = ["brouillon", "maquette", "en_file", "en_fabrication", "prete", "echec", "annulee", "archivee"] as const;
export const ETAPES_STUDIO = ["a_relire", "validee", "programmee", "publiee"] as const;
export const ETATS_PUBLICATION_STUDIO = ["brouillon", "programmee", "publiee", "echec"] as const;
export const releveStudio = z.object({
  jour: z.union([z.literal(3), z.literal(7)]),
  vues: z.number().int().nonnegative(),
  portee: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  commentaires: z.number().int().nonnegative(),
  partages: z.number().int().nonnegative(),
  dureeMoyenneVueSec: z.number().nonnegative(),
});

// § 5 · Lien suivi -------------------------------------------------------------------------------------

export const PAGES_ARRIVEE = { guide: "/fr/guide-ia", diagnostic: "/fr/diagnostic", appel: "/fr/appel" } as const;

/** Les liens se fabriquent dans `lien-suivi.ts` (`construireLienSuivi`), jamais à la main. */

// § 6 · Demandes de guide (après W1) -----------------------------------------------------------------

export const demandeGuide = z.object({
  id: z.string(),
  aimant: codeCadeau,
  emailKey: z.string(),
  createdAt: z.string(),
  firstClickAt: z.string().nullable(),
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
});

// § 7 · Mots et « mot branché » ------------------------------------------------------------------------

export const RESEAUX_MOT = ["instagram", "facebook"] as const;
export const reseauMot = z.enum(RESEAUX_MOT);
export const ETATS_BRANCHEMENT = ["non_branche", "branche"] as const;

export const mot = z.object({
  code: codeMot,
  mot: z.string().regex(/^[A-Z0-9À-Ý]+$/),
  cadeau: codeCadeau,
  outil: z.string(),
});

/** `compte` vide = la ligne vaut pour tous les comptes du réseau. */
export const motBranche = z.object({
  mot: z.string().min(1),
  reseau: reseauMot,
  compte: z.string().optional(),
  etat: z.enum(ETATS_BRANCHEMENT),
  le: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type MotBranche = z.infer<typeof motBranche>;

// § 8 · Opposition -----------------------------------------------------------------------------------

export const CANAUX_OPPOSITION = ["instagram", "facebook", "email", "tous"] as const;
export const SOURCES_OPPOSITION = ["zernio-stop", "site", "will"] as const;
export const opposition = z.object({
  /** Empreinte d'adresse (calculée comme au site : minuscules, espaces retirés, SHA-256) ou `<reseau>:<compte>`. */
  cle: z.string().min(1),
  canal: z.enum(CANAUX_OPPOSITION),
  depuis: z.string(),
  source: z.enum(SOURCES_OPPOSITION),
});
export type Opposition = z.infer<typeof opposition>;
