/**
 * Ce que le tirage lit et rend (T08). Tout est passé en paramètre : `tirer()` ne lit jamais la base,
 * pour être essayé seul ; `chargerTirage()` (charger.ts) remplit ces formes depuis `src/donnees/`.
 */
import type { Reseau, TypeContenu } from "@/contrats";
import type { CodeRefus } from "@/contrats";
import type { LigneBase } from "@/donnees/types";

/** Les lignes des bases utiles au tirage (colonnes de la migration 001). */
export interface BasesTirage {
  /** Métiers allumés par Will (`metier.allume`), non retirés. */
  metiers: Pick<LigneBase<"metier">, "code" | "tailles_typiques">[];
  tailles: Pick<LigneBase<"taille">, "code" | "poids">[];
  /** Codes de `service` (formation, audit, coaching, integration). */
  services: string[];
  douleurs: Pick<LigneBase<"douleur">, "code" | "cible" | "services" | "tailles" | "type_contenu">[];
  cas: Pick<LigneBase<"cas_usage">, "code" | "cible" | "service" | "douleurs" | "phare" | "sujet" | "formats_conseilles">[];
  accroches: Pick<LigneBase<"accroche">, "code" | "famille" | "types_contenu">[];
  appels: Pick<LigneBase<"appel">, "code" | "reseaux" | "cible" | "type_contenu" | "type" | "objectif" | "dit" | "ecran" | "legende" | "mot" | "emplacement">[];
  /** Formats tirables : `format.id` d'une vidéo, ou `format_autre.code` (carrousel, story, post_texte_linkedin). */
  formats: FormatTirage[];
  /** Nouveautés gardées par Will (`retenue = oui`), non retirées. */
  actualites: Pick<LigneBase<"actualite">, "code" | "perime_le">[];
  comptes: { code: string; reseau: Reseau; lien_profil: string | null }[];
  /** Mots branchés (contrat § 7) : `compte` vide = tous les comptes du réseau. */
  motsBranches: { mot: string; reseau: Reseau; compte: string }[];
}

export interface FormatTirage {
  code: string;
  type_contenu: TypeContenu;
  /** Un format « bientôt » (pas encore en service) compte pour zéro et n'est jamais tiré. */
  en_service: boolean;
}

export interface ReglagesTirage {
  /** Réseaux du lot ; TikTok et LinkedIn ne sont jamais cochés d'office. */
  reseaux: Reseau[];
  /** Poids par taille (`TPE` : 1…) ; 0 = jamais tirée ; absent = 1. */
  poidsTailles: Record<string, number>;
  /** Poids par service ; 0 = jamais tiré ; absent = 1. */
  poidsServices: Record<string, number>;
  /** Part de chaque format par réseau, en % (`{ instagram: { "tableau-anime": 100 } }`). */
  partsFormats: Partial<Record<Reseau, Record<string, number>>>;
  /** Rythme de la famille « Actualités » : contenus par 7 jours. */
  rythmeActualites: number;
  /** Délai avant qu'un même cas revienne dans un autre format (jours). */
  delaiCasJours: number;
  /** Interrupteur `tirage.fin-rendez-vous` : la fin « rendez-vous » n'est tirée que s'il est allumé. */
  finRendezVous: boolean;
  /** Restreint le lot à ces métiers (parmi les allumés). */
  metiers?: string[];
  /**
   * Règles de variété levées : un même métier ou une même taille peut revenir de suite (porte du studio, quand
   * la demande ne laisse qu'un métier ou qu'une taille).
   */
  repetitionsPermises?: ("metier" | "taille")[];
  /** Graine du hasard (même graine, mêmes bases, même historique : même tirage). */
  graine?: number;
  maintenant?: Date;
}

/** Ce qui a déjà été commandé (lignes de lot, toutes, même refusées ou archivées) ou fabriqué hors de l'Usine. */
export interface HistoriqueTirage {
  lignes: LigneHistorique[];
  dejaFabrique: DejaFabriqueTirage[];
}

export interface LigneHistorique {
  metier: string | null;
  taille: string | null;
  service: string | null;
  douleur: string | null;
  cas_usage: string | null;
  actualite: string | null;
  format: string | null;
  structure: string | null;
  accroche: string | null;
  fins: Partial<Record<Reseau, string>>;
  refus: CodeRefus | null;
  signature: string | null;
  /** Date de la commande (ou de création de la ligne). */
  le: Date;
}

export interface DejaFabriqueTirage {
  signature: string;
  cas_usage: string | null;
  format: string | null;
  le: Date;
}

/** Une ligne tirée : les colonnes de `lot_ligne`, plus le mot de chaque fin au mot. */
export interface LigneTiree {
  rang: number;
  type_contenu: TypeContenu;
  format: string;
  public: "public.clients";
  metier: string | null;
  taille: string | null;
  service: string | null;
  douleur: string | null;
  cas_usage: string | null;
  sujet: string | null;
  actualite: string | null;
  accroche: string;
  /** Famille d'accroche : la structure de la ligne (variété et signature). */
  structure: string;
  reseaux: Reseau[];
  /** Fin par réseau (`appel.code`). */
  fins: Partial<Record<Reseau, string>>;
  /** Mot de la fin, pour les réseaux dont la fin est au mot. */
  mots: Partial<Record<Reseau, string>>;
  signature: string;
}

export interface ResultatTirage {
  demandees: number;
  lignes: LigneTiree[];
  /** Vide quand toutes les lignes demandées sont rendues ; sinon pourquoi, par métier. */
  pourquoi: { metier: string | null; message: string }[];
}
