/**
 * CONTRATS-ECHANGE.md § 5 · ADR 0002 « lien suivi unique » : le seul endroit de l'Usine qui écrit un lien vers axion-ia.com.
 * Sa sortie est identique, caractère pour caractère, aux fixtures de l'ADR (tests/fixtures/0002-lien-suivi-unique.fixtures.json).
 */
import { PAGES_ARRIVEE } from "./echanges";
import { RESEAUX } from "./identifiants";

export const NATURES_LIEN = ["message", "profil", "video"] as const;
export const NATURES_LIEN_RESERVEES = ["post"] as const;
export const RESEAUX_MESSAGE = ["facebook", "instagram", "linkedin"] as const;
/** `public.code` sans le préfixe `public.`. */
export const ACTIVITES_LIEN = ["clients", "apporteurs", "formateurs"] as const;
export const LONGUEUR_MAX_LIEN = 60;

const CODE_VERSION = /^[0-9]{4,6}-[A-Z]{2,3}-[A-Z]{2,3}(-[A-Z0-9]{1,8})*$/;
const CODE_MOT = /^mot-[a-z0-9][a-z0-9-]*$/;
const CARACTERES_PERMIS = /^[A-Za-z0-9-]+$/;
const DOMAINE = "https://axion-ia.com";

export type RefusLienSuivi =
  | "reseau_inconnu"
  | "nature_reservee"
  | "nature_inconnue"
  | "activite_inconnue"
  | "page_interdite"
  | "code_version_attendu"
  | "code_mot_attendu"
  | "caractere_interdit"
  | "trop_long"
  | "message_impossible_sur_ce_reseau";

export class ErreurLienSuivi extends Error {
  readonly refus: RefusLienSuivi;
  constructor(refus: RefusLienSuivi) {
    super(`Lien suivi refusé : ${refus}.`);
    this.name = "ErreurLienSuivi";
    this.refus = refus;
  }
}

export type EntreeLienSuivi = {
  /** `video` (code de version) · `message` et `profil` (code de mot). */
  typeLien: string;
  reseau: string;
  /** `version.code` tel quel (casse comprise) ou `mot.code`. */
  code: string;
  /** `clients` · `apporteurs` · `formateurs`. */
  activite: string;
  /** Une des trois pages d'arrivée, sans requête. */
  page: string;
};

function dans<T extends string>(liste: readonly T[], valeur: string): valeur is T {
  return (liste as readonly string[]).includes(valeur);
}

/** Construit le lien suivi, ou refuse : jamais d'adresse partielle, jamais de valeur corrigée (sauf la casse du réseau, de la nature et de l'activité). */
export function construireLienSuivi(entree: EntreeLienSuivi): string {
  const nature = entree.typeLien.toLowerCase();
  if (dans(NATURES_LIEN_RESERVEES, nature)) throw new ErreurLienSuivi("nature_reservee");
  if (!dans(NATURES_LIEN, nature)) throw new ErreurLienSuivi("nature_inconnue");
  const source = entree.reseau.toLowerCase();
  if (!dans(RESEAUX, source)) throw new ErreurLienSuivi("reseau_inconnu");
  const activite = entree.activite.toLowerCase();
  if (!dans(ACTIVITES_LIEN, activite)) throw new ErreurLienSuivi("activite_inconnue");
  const page = entree.page;
  if (!dans(Object.values(PAGES_ARRIVEE), page)) throw new ErreurLienSuivi("page_interdite");
  const code = entree.code;
  if (!CARACTERES_PERMIS.test(code)) throw new ErreurLienSuivi("caractere_interdit");
  if (code.length > LONGUEUR_MAX_LIEN) throw new ErreurLienSuivi("trop_long");
  if (nature === "video") {
    if (!CODE_VERSION.test(code)) throw new ErreurLienSuivi("code_version_attendu");
  } else if (!CODE_MOT.test(code)) {
    throw new ErreurLienSuivi("code_mot_attendu");
  }
  if (nature === "message" && !dans(RESEAUX_MESSAGE, source)) throw new ErreurLienSuivi("message_impossible_sur_ce_reseau");

  const requete = `utm_source=${source}&utm_medium=${nature}&utm_campaign=${code}&utm_content=${activite}`;
  const depuis = page === PAGES_ARRIVEE.appel ? `&depuis=${nature}-${source}` : "";
  return `${DOMAINE}${page}?${requete}${depuis}`;
}
