/**
 * Porte du studio (CONTRATS-ECHANGE.md § 3, « plus tard, porte du studio, demande D9 ») : le studio demande des
 * sujets à l'Usine et lui dit ceux qu'il a retenus. Échange décrit pour le studio dans docs/CONTRAT-PORTE.md.
 * Les routes : `POST /api/porte/sujets`, `POST /api/porte/sujets/retenir`, `POST /api/porte/sujets/retenir-lot` (v1.1), `GET /api/porte/metiers`.
 */
import { z } from "zod";
import { codeMetier, codeService, codeTaille, reseau, typeContenu, type Reseau, type TypeContenu } from "./identifiants";

/** Variable du serveur : sans elle (ou plus courte que 32 caractères), la porte est éteinte et ses routes rendent 404. */
export const VARIABLE_PORTE = "USINE_PORTE_SECRET";
export const LONGUEUR_MIN_SECRET_PORTE = 32;

const code = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/);
const liste = <T extends z.ZodType>(schema: T, max: number) => z.array(schema).min(1).max(max);

/** Corps de `POST /api/porte/sujets`. */
export const demandeSujets = z.strictObject({
  n: z.number().int().min(1).max(20),
  type_contenu: typeContenu,
  reseaux: liste(reseau, 6),
  /** Ces métiers seulement, même non allumés ; absent : les métiers allumés. */
  metiers: liste(codeMetier, 50).optional(),
  tailles: liste(codeTaille, 4).optional(),
  services: liste(codeService, 4).optional(),
  graine: z.number().int().min(0).max(2 ** 31 - 1).optional(),
});
export type DemandeSujets = z.infer<typeof demandeSujets>;

/** Les parts d'une signature (`métier|taille|service|douleur|cas ou nouveauté|format|famille d'accroche`). */
export const partsSujet = z.strictObject({
  metier: code.nullable(),
  taille: code.nullable(),
  service: code.nullable(),
  douleur: code.nullable(),
  cas_usage: code.nullable(),
  actualite: code.nullable(),
  format: code.nullable(),
  /** Famille d'accroche (texte libre des bases : « scène vécue »). */
  structure: z.string().trim().min(1).max(120).nullable(),
});
export type PartsSujet = z.infer<typeof partsSujet>;

/** Corps de `POST /api/porte/sujets/retenir`. */
export const retenirSujet = z.strictObject({
  signature: z.string().min(1).max(800),
  parts: partsSujet,
  type_contenu: typeContenu,
  /** Repère de la vidéo au studio (code de version `0042-AV-TT` ou identifiant du studio). */
  reference_studio: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/),
});
export type RetenirSujet = z.infer<typeof retenirSujet>;

/** Nombre de sujets au plus par appel de `POST /api/porte/sujets/retenir-lot` (le corps reste sous les 16 Ko de la porte). */
export const LOT_MAX_RETENIR = 20;

/** Corps de `POST /api/porte/sujets/retenir-lot` : plusieurs sujets à retenir d'un coup (v1.1). */
export const retenirLot = z.strictObject({
  sujets: z.array(retenirSujet).min(1).max(LOT_MAX_RETENIR),
});
export type RetenirLot = z.infer<typeof retenirLot>;

/** Une fin choisie pour un réseau (`appel` de la base 7). */
export interface FinSujet {
  appel: string;
  type: string | null;
  objectif: string | null;
  dit: string | null;
  ecran: string | null;
  /** Mot à commenter, quand la fin est au mot et que le mot est branché. */
  mot: string | null;
}

/** Une ligne rendue par `POST /api/porte/sujets` : codes et textes lisibles. */
export interface SujetPropose {
  rang: number;
  signature: string;
  parts: PartsSujet;
  type_contenu: TypeContenu;
  reseaux: Reseau[];
  metier: { code: string; libelle: string | null; secteur: string | null } | null;
  taille: { code: string; libelle: string | null } | null;
  service: { code: string; libelle: string | null } | null;
  douleur: { code: string; dite: string | null; scene_avant: string | null } | null;
  cas_usage: { code: string; titre: string | null; probleme: string | null; ce_que_ca_change: string | null } | null;
  sujet: { code: string; titre: string | null } | null;
  actualite: { code: string; titre: string | null; ce_qui_change: string | null; source: string | null } | null;
  format: { code: string; libelle: string | null };
  accroche: { code: string; famille: string; modele: string | null; exemple: string | null };
  fins: Partial<Record<Reseau, FinSujet>>;
}

export interface ReponseSujets {
  demandees: number;
  lignes: SujetPropose[];
  /** Vide quand toutes les lignes demandées sont rendues ; sinon pourquoi, par métier. */
  pourquoi: { metier: string | null; message: string }[];
}

/** Réponse de `POST /api/porte/sujets/retenir` (schéma : sert aux fixtures de contrat). */
export const reponseRetenir = z.strictObject({
  signature: z.string().min(1).max(800),
  deja: z.boolean(),
});

/** Codes d'erreur (champ `code`) que la porte peut rendre. Les 401 et 404 n'en portent pas. */
export const CODES_ERREUR_PORTE = [
  "metier_inconnu",
  "aucun_metier_allume",
  "signature_incoherente",
  "format_absent",
  "sujet_absent",
  "parts_absentes",
  "code_inconnu",
  "corps_trop_grand",
  "type_invalide",
  "json_illisible",
  "demande_invalide",
] as const;
export type CodeErreurPorte = (typeof CODES_ERREUR_PORTE)[number];

export interface ReponseRetenir {
  signature: string;
  /** Vrai si le sujet était déjà noté (appel répété : rien n'est réécrit). */
  deja: boolean;
}

/** Réponse de `POST /api/porte/sujets/retenir-lot` : une ligne par sujet, dans l'ordre reçu. */
export const reponseRetenirLot = z.strictObject({
  retenus: z.number().int().min(0),
  deja: z.number().int().min(0),
  lignes: z.array(reponseRetenir),
});
export interface ReponseRetenirLot {
  /** Sujets notés à cet appel. */
  retenus: number;
  /** Sujets déjà notés (rejeu, ou même signature deux fois dans le lot) : rien n'est réécrit. */
  deja: number;
  lignes: ReponseRetenir[];
}

/** Une ligne de `GET /api/porte/metiers`. */
export interface MetierPorte {
  code: string;
  libelle: string | null;
  secteur: { code: string | null; libelle: string | null };
  allume: boolean;
  /** Cas d'usage non retirés qui citent une source. */
  cas_sources: number;
}
