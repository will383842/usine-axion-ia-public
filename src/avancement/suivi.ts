/**
 * RC-13 · Suivi des campagnes et des cases du calendrier : règles pures, sans base, sans appel sortant.
 * Les cases viennent d'une lecture du calendrier du Studio (lecture seule), faite ailleurs et donnée ici.
 * Une donnée absente (lecture manquante, état inconnu) donne `null` et s'affiche « non disponible », jamais 0.
 * Livré éteint : rien ne l'appelle encore.
 */
import type { Reseau } from "@/contrats";
import { verifierCampagne, type Campagne } from "@/campagnes/regles";

export const NON_DISPONIBLE = "non disponible";

export interface CaseSuivie {
  /** « AAAA-MM-JJ ». */
  jour: string;
  reseau: Reseau;
  /** `null` ou absent : état inconnu. */
  publiee?: boolean | null;
}

export interface SuiviCampagne {
  /** Cases de la campagne ; `null` si le calendrier n'a pas pu être lu. */
  cases: number | null;
  /** Cases publiées ; `null` si aucune case n'a d'état connu. */
  publiees: number | null;
  /** Cases dont l'état est inconnu ; `null` si le calendrier n'a pas pu être lu. */
  partInconnues: number | null;
  /** Part publiée parmi les cases d'état connu, en % entier ; `null` si non calculable. */
  partPubliee: number | null;
}

const JOUR_MS = 86_400_000;
const enJours = (j: string) => Date.parse(`${j}T00:00:00Z`) / JOUR_MS;

const RIEN: SuiviCampagne = { cases: null, publiees: null, partInconnues: null, partPubliee: null };

/** Même règle que `jourValide` de `src/campagnes/regles.ts` : « AAAA-MM-JJ » et jour qui existe (aller-retour). */
const jourValide = (j: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(j) && Number.isFinite(enJours(j)) && new Date(`${j}T00:00:00Z`).toISOString().startsWith(j);

/** Case du réseau de la campagne dont le jour est illisible : comptée comme inconnue, jamais perdue. */
const jourIllisible = (c: Campagne, k: CaseSuivie): boolean => k.reseau === c.reseau && !jourValide(k.jour);

function dansCampagne(c: Campagne, k: CaseSuivie): boolean {
  if (k.reseau !== c.reseau || !jourValide(k.jour)) return false;
  const rang = enJours(k.jour) - enJours(c.debut);
  return Number.isFinite(rang) && rang >= 0 && rang < c.dureeJours;
}

export function suivreCampagne(c: Campagne, cases: readonly CaseSuivie[] | null | undefined): SuiviCampagne {
  if (!cases || verifierCampagne(c) !== null) return { ...RIEN };
  const miennes = cases.filter((k) => dansCampagne(c, k));
  const illisibles = cases.filter((k) => jourIllisible(c, k)).length;
  const connues = miennes.filter((k) => typeof k.publiee === "boolean");
  const publiees = connues.filter((k) => k.publiee === true).length;
  return {
    cases: miennes.length + illisibles,
    publiees: connues.length === 0 ? null : publiees,
    partInconnues: miennes.length - connues.length + illisibles,
    partPubliee: connues.length === 0 ? null : Math.round((publiees / connues.length) * 100),
  };
}

export const afficherNombre = (n: number | null | undefined): string => (typeof n === "number" && Number.isFinite(n) ? String(n) : NON_DISPONIBLE);
export const afficherPart = (n: number | null | undefined): string => (typeof n === "number" && Number.isFinite(n) ? `${n} %` : NON_DISPONIBLE);
