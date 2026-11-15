/**
 * RC-12 · Campagnes (deux modes), règles pures : sans base, sans envoi, sans appel sortant.
 * Une campagne : réseau × nombre par jour × durée × pause. Mode « aleatoire » : tirage reproductible
 * (même graine, même jour, même résultat, `hasardDepuis` du tirage) ; mode « parametre » : jours de la semaine
 * choisis, premiers candidats dans l'ordre donné. En pause ou hors durée : rien n'est proposé.
 * Livré éteint : rien ne l'appelle encore, l'écran et le branchement viennent après la décision du fondateur.
 */
import type { Reseau } from "@/contrats";
import { RYTHME_MAX_PAR_SEMAINE } from "@/reglages/modele";
import { hasardDepuis } from "@/tirage/tirer";

export const INTERRUPTEUR_CAMPAGNES = "campagnes";

export interface Campagne {
  reseau: Reseau;
  mode: "aleatoire" | "parametre";
  parJour: number;
  /** Premier jour, « AAAA-MM-JJ ». */
  debut: string;
  dureeJours: number;
  pause: boolean;
  /** Mode aléatoire : graine du tirage. */
  graine?: number;
  /** Mode paramétré : jours de la semaine, 1 = lundi … 7 = dimanche. */
  jours?: number[];
}

const JOUR_MS = 86_400_000;
const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;

const enJours = (j: string) => Date.parse(`${j}T00:00:00Z`) / JOUR_MS;
const jourValide = (j: string) => FORMAT_JOUR.test(j) && Number.isFinite(enJours(j)) && new Date(`${j}T00:00:00Z`).toISOString().startsWith(j);
const jourDeSemaine = (j: string) => ((new Date(`${j}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Rend un message en français, ou null si la campagne tient. */
export function verifierCampagne(c: Campagne): string | null {
  if (!jourValide(c.debut)) return "Le premier jour doit être une date, par exemple 2024-01-01.";
  if (!Number.isInteger(c.dureeJours) || c.dureeJours < 1) return "Une campagne dure au moins un jour.";
  if (!Number.isInteger(c.parJour) || c.parJour < 1) return "Il faut au moins une publication par jour.";
  if (c.mode === "parametre") {
    if (!c.jours || c.jours.length === 0 || c.jours.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) return "Choisissez au moins un jour de la semaine.";
  }
  const joursParSemaine = c.mode === "parametre" ? new Set(c.jours).size : 7;
  if (c.parJour * joursParSemaine > RYTHME_MAX_PAR_SEMAINE) return `Pas plus de ${RYTHME_MAX_PAR_SEMAINE} publications par semaine.`;
  return null;
}

/** Contenus proposés ce jour-là ; `candidats` est déjà filtré par le tirage. En pause ou hors durée : rien. */
export function proposerDuJour(c: Campagne, jour: string, candidats: readonly string[]): string[] {
  if (c.pause || verifierCampagne(c) !== null || !jourValide(jour)) return [];
  const rang = enJours(jour) - enJours(c.debut);
  if (rang < 0 || rang >= c.dureeJours) return [];
  const n = Math.min(c.parJour, candidats.length);
  if (c.mode === "parametre") {
    return c.jours!.includes(jourDeSemaine(jour)) ? candidats.slice(0, n) : [];
  }
  const hasard = hasardDepuis(((c.graine ?? 0) + rang * 7919) >>> 0);
  const reste = [...candidats];
  const choisis: string[] = [];
  for (let i = 0; i < n; i++) choisis.push(reste.splice(Math.floor(hasard() * reste.length), 1)[0]);
  return choisis;
}
