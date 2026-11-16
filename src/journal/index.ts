/**
 * Journal d'activité : lecture seule de la table `journal` (les modules y écrivent déjà). Du plus récent au plus ancien,
 * 50 lignes par page, filtrable par sujet et par cible. Les données de personne (email, telephone, nom) sont masquées.
 */
import "server-only";
import { requete } from "@/lib/base";
import { interrupteurAllume } from "@/donnees";

export const TAILLE_PAGE = 50;
export const CODE_INTERRUPTEUR = "journal";
const CLES_MASQUEES = new Set(["email", "telephone", "nom"]);
const MASQUE = "•••";

export interface LigneLue {
  id: string;
  le: Date;
  sujet: string;
  cible: string | null;
  message: string;
  donnees: unknown;
}

export interface FiltresJournal {
  sujet?: string;
  cible?: string;
  page?: number;
}

export interface PageJournal {
  lignes: LigneLue[];
  page: number;
  suivante: boolean;
}

export const journalAllume = () => interrupteurAllume(CODE_INTERRUPTEUR);

/** Remplace, à tous les niveaux, la valeur des clés email, telephone et nom. */
export function masquerDonnees(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(masquerDonnees);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, CLES_MASQUEES.has(k.toLowerCase()) ? MASQUE : masquerDonnees(v)]));
  }
  return valeur;
}

/** Une cible filtrée « L12 » retient « L12 » et « L12-n », jamais « L123 ». */
export function correspondCible(filtre: string, cible: string | null): boolean {
  return cible === filtre || (cible?.startsWith(`${filtre}-`) ?? false);
}

const echapperLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export async function lireJournal(filtres: FiltresJournal = {}): Promise<PageJournal> {
  const page = Number.isInteger(filtres.page) && (filtres.page as number) > 0 ? (filtres.page as number) : 1;
  const sujet = filtres.sujet?.trim() || null;
  const cible = filtres.cible?.trim() || null;
  const valeurs: unknown[] = [];
  const ou: string[] = [];
  if (sujet) {
    valeurs.push(sujet);
    ou.push(`sujet = $${valeurs.length}`);
  }
  if (cible) {
    valeurs.push(cible, `${echapperLike(cible)}-%`);
    ou.push(`(cible = $${valeurs.length - 1} OR cible LIKE $${valeurs.length})`);
  }
  valeurs.push(TAILLE_PAGE + 1, (page - 1) * TAILLE_PAGE);
  const rows = await requete<LigneLue>(
    `SELECT id::text AS id, le, sujet, cible, message, donnees FROM journal${ou.length ? ` WHERE ${ou.join(" AND ")}` : ""}
     ORDER BY le DESC, id DESC LIMIT $${valeurs.length - 1} OFFSET $${valeurs.length}`,
    valeurs,
  );
  return { lignes: rows.slice(0, TAILLE_PAGE).map((l) => ({ ...l, donnees: masquerDonnees(l.donnees) })), page, suivante: rows.length > TAILLE_PAGE };
}

export async function sujetsDuJournal(): Promise<string[]> {
  return (await requete<{ sujet: string }>("SELECT DISTINCT sujet FROM journal ORDER BY sujet LIMIT 200")).map((r) => r.sujet);
}
