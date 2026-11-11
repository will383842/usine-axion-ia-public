/**
 * Lignes telles que `pg` les rend. `bigserial` et `numeric` arrivent en texte (précision gardée) ;
 * `date` et `timestamptz` en `Date`.
 */
import type { CodeRefus, Etat, EtatLotLigne, NatureCompte, Reseau, TypeContenu } from "@/contrats";
import type { COLONNES_BASES, COLONNES_TECHNIQUES_BASES, NomTableBase } from "./schema";

type Horodatage = { cree_le: Date; modifie_le: Date };
type Archivable = Horodatage & { archive_le: Date | null };

/** Une ligne d'une table des bases : toutes les colonnes en texte, plus les colonnes de l'Usine. */
export type LigneBase<T extends NomTableBase> = { [K in (typeof COLONNES_BASES)[T][number]]: K extends "code" ? string : K extends "etat" ? Etat : string | null } & {
  [K in Exclude<(typeof COLONNES_TECHNIQUES_BASES)[number], "importe_le">]: Date;
} & { importe_le: Date | null } & (T extends "metier" ? { allume: boolean } : unknown);

export interface Service extends Archivable {
  code: string;
  nom: string;
  serie_studio: string | null;
  passage_site: string | null;
  ordre: number;
  etat: Etat;
  version: string | null;
  origine: string | null;
  source: string | null;
  valide_le: string | null;
}

export interface Compte extends Archivable {
  code: string;
  reseau: Reseau;
  identifiant: string;
  nature: NatureCompte;
  nom: string | null;
  publieur: string | null;
  lien_profil: string | null;
  objectif_visibilite: string | null;
  actif: boolean;
  etat: Etat;
  version: string | null;
  origine: string | null;
  source: string | null;
  valide_le: string | null;
}

export interface Reglage extends Horodatage {
  cle: string;
  valeur: unknown;
}

export interface Interrupteur extends Archivable {
  code: string;
  nom: string;
  description: string | null;
  allume: boolean;
}

export interface LigneJournal {
  id: string;
  le: Date;
  sujet: string;
  cible: string | null;
  message: string;
  donnees: unknown;
}

export interface Refus extends Archivable {
  code: CodeRefus;
  nom: string;
  ordre: number;
}

export interface Lot extends Archivable {
  id: string;
  numero: number;
  nombre: number;
  plafond_eur: string;
  reglages: Record<string, unknown>;
  etat: "brouillon" | "commande";
  commande_le: Date | null;
}

export interface LotLigne extends Archivable {
  id: string;
  lot: string;
  rang: number;
  type_contenu: TypeContenu;
  format: string | null;
  public: string;
  metier: string | null;
  taille: string | null;
  service: string | null;
  douleur: string | null;
  cas_usage: string | null;
  sujet: string | null;
  actualite: string | null;
  accroche: string | null;
  structure: string | null;
  reseaux: Reseau[];
  /** Fin voulue par réseau : `{ instagram: "fin-ig-…" }` (`appel.code`). */
  fins: Partial<Record<Reseau, string>>;
  repere: string;
  cout_max_eur: string;
  paquet: unknown;
  etat: EtatLotLigne;
  code_version: string | null;
  refus: CodeRefus | null;
  /** Signature du contenu (migration 002, `signature()` de src/tirage/) : unique, jamais retirée. */
  signature: string | null;
}

export interface Cadeau extends Archivable {
  code: string;
  nom: string;
  document: string | null;
  version: string | null;
  etat: Etat;
  valide_le: string | null;
}

export interface Mot extends Archivable {
  code: string;
  mot: string;
  cadeau: string | null;
  outil: string;
  /** Identifiants d'automatisation saisis à la main, par réseau ou par compte. */
  automatisations: Record<string, string>;
  ordre: number;
}

export interface MotTexte extends Archivable {
  id: string;
  mot: string;
  nature: string;
  reseau: string;
  rang: number;
  version: number;
  texte: string;
  source: string | null;
  etat: Etat;
  valide_le: string | null;
  en_service: boolean;
}

export interface MotBrancheLigne extends Archivable {
  id: string;
  /** Le mot lui-même (`GUIDE`), comme au contrat § 7. */
  mot: string;
  reseau: "instagram" | "facebook";
  /** Identifiant public du compte ; vide = tous les comptes du réseau. */
  compte: string;
  etat: "non_branche" | "branche";
  le: Date;
}

export interface OppositionLigne {
  id: string;
  cle: string;
  canal: "instagram" | "facebook" | "email" | "tous";
  depuis: Date;
  source: "zernio-stop" | "site" | "will";
  cree_le: Date;
}

export interface Carte extends Archivable {
  id: string;
  cle: string | null;
  titre: string;
  detail: string | null;
  bouton: string;
  lien: string | null;
  urgence: number;
  /** Code d'interrupteur : la carte ne s'affiche que s'il est allumé. */
  interrupteur: string | null;
  origine: string | null;
  echeance: Date | null;
  fait_le: Date | null;
}

export interface CompteASuivre extends Archivable {
  code: string;
  reseau: Reseau;
  nom: string;
  lien: string | null;
  note: string | null;
  propose_le: Date | null;
  fait_le: Date | null;
}

export interface CalendrierLigne extends Archivable {
  id: string;
  lot_ligne: string | null;
  reseau: Reseau;
  compte: string | null;
  type_contenu: TypeContenu;
  format: string | null;
  prevue_le: Date;
  etat: "brouillon" | "programmee" | "publiee" | "echec";
  note: string | null;
}

/** Contenu fait hors de l'Usine ou avant elle (migration 002) : sa signature n'est jamais tirée. */
export interface DejaFabrique extends Archivable {
  id: string;
  type_contenu: TypeContenu;
  metier: string | null;
  taille: string | null;
  service: string | null;
  douleur: string | null;
  cas_usage: string | null;
  sujet: string | null;
  actualite: string | null;
  format: string | null;
  structure: string | null;
  signature: string;
  code_version: string | null;
  fabrique_le: Date;
  note: string | null;
}

export interface ReleveMot extends Archivable {
  id: string;
  semaine: Date;
  mot: string;
  compte: string;
  commentaires: number;
  messages: number;
  demandes_guide: number;
  abonnes_gagnes: number;
}
