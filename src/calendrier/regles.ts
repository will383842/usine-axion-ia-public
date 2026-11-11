/**
 * T11 · Règles du calendrier, sans accès à la base : répartition selon les rythmes, trous, écart des parts.
 * Les jours sont des textes « AAAA-MM-JJ » (heure de Paris) ; la semaine commence le lundi.
 */
import type { Reseau } from "@/contrats";
import { FORMATS_PART, type FormatPart, type Parts, type PartsParReseau, type Rythme, type RythmesParReseau } from "@/reglages/modele";

export const INTERRUPTEUR_CALENDRIER = "calendrier";
export const INTERRUPTEUR_CARTE_TROU = "ma-journee.calendrier-trou";
export const INTERRUPTEUR_CARTE_LINKEDIN = "ma-journee.commentaires-linkedin";
/** Heure de publication proposée (modifiable par jour seulement dans cet écran). */
export const HEURE_PROPOSEE = "09:00";
export const FENETRE_PARTS_JOURS = 30;

const JOUR = 86_400_000;
const enMs = (jour: string) => Date.parse(`${jour}T00:00:00Z`);
const enJour = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const jourValide = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && enJour(enMs(v)) === v;
export const ajouterJours = (jour: string, n: number) => enJour(enMs(jour) + n * JOUR);

/** Le lundi de la semaine du jour donné. */
export function lundiDe(jour: string): string {
  const dow = new Date(enMs(jour)).getUTCDay(); // 0 = dimanche
  return ajouterJours(jour, -((dow + 6) % 7));
}

/** Publications visées par semaine : le milieu du rythme, arrondi vers le haut (0 = réseau au repos). */
export const parSemaine = (r: Rythme) => Math.ceil((r.min + r.max) / 2);

/** Jours (0 = lundi … 6 = dimanche) des `n` publications d'une semaine, étalés. */
export function joursDeLaSemaine(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.floor((i * 7) / n));
}

export interface APlacer {
  ligne: string;
  reseau: Reseau;
}
export interface Placement extends APlacer {
  jour: string;
}

/**
 * Répartit les contenus (dans l'ordre reçu) sur les semaines à venir : par réseau, autant par semaine que le rythme le dit,
 * en tenant compte de ce qui est déjà prévu (`occupe[reseau][lundi]` = nombre déjà pris) et sans rien placer avant `depuis`.
 * Un réseau au repos (rythme 0) n'est pas placé : ses contenus sont rendus dans `sansPlace`.
 */
export function repartir(
  aPlacer: APlacer[],
  rythmes: RythmesParReseau,
  occupe: Partial<Record<Reseau, Record<string, number>>>,
  depuis: string,
): { placements: Placement[]; sansPlace: APlacer[] } {
  const placements: Placement[] = [];
  const sansPlace: APlacer[] = [];
  const pris: Record<string, Record<string, number>> = {};
  const curseur: Record<string, string> = {};
  for (const a of aPlacer) {
    const n = parSemaine(rythmes[a.reseau]);
    if (n === 0) {
      sansPlace.push(a);
      continue;
    }
    const jours = joursDeLaSemaine(n);
    const dejaPris = (pris[a.reseau] ??= { ...(occupe[a.reseau] ?? {}) });
    let lundi = curseur[a.reseau] ?? lundiDe(depuis);
    for (;;) {
      let k = dejaPris[lundi] ?? 0;
      let trouve: string | null = null;
      while (k < n && !trouve) {
        const jour = ajouterJours(lundi, jours[k]);
        k += 1;
        dejaPris[lundi] = k;
        if (jour >= depuis) trouve = jour;
      }
      if (trouve) {
        curseur[a.reseau] = lundi;
        placements.push({ ...a, jour: trouve });
        break;
      }
      lundi = ajouterJours(lundi, 7);
    }
  }
  return { placements, sansPlace };
}

export interface Trou {
  reseau: Reseau;
  lundi: string;
  prevues: number;
  manque: number;
}

/** Les semaines (`lundis`) où un réseau a moins de publications prévues que le minimum de son rythme. */
export function trous(rythmes: RythmesParReseau, prevues: Partial<Record<Reseau, Record<string, number>>>, lundis: string[]): Trou[] {
  const sortie: Trou[] = [];
  for (const lundi of lundis)
    for (const reseau of Object.keys(rythmes) as Reseau[]) {
      const min = rythmes[reseau].min;
      const n = prevues[reseau]?.[lundi] ?? 0;
      if (min > 0 && n < min) sortie.push({ reseau, lundi, prevues: n, manque: min - n });
    }
  return sortie;
}

export interface EcartPart {
  format: FormatPart;
  voulue: number;
  constatee: number;
  ecart: number;
}

/** Part voulue (Réglages) contre part constatée sur 30 jours, en points ; sans publication, la part constatée est 0. */
export function ecartsDesParts(voulues: Parts, constates: Partial<Record<FormatPart, number>>): EcartPart[] {
  const total = FORMATS_PART.reduce((a, f) => a + (constates[f] ?? 0), 0);
  return FORMATS_PART.filter((f) => voulues[f] > 0 || (constates[f] ?? 0) > 0).map((format) => {
    const constatee = total === 0 ? 0 : Math.round(((constates[format] ?? 0) * 100) / total);
    return { format, voulue: voulues[format], constatee, ecart: constatee - voulues[format] };
  });
}

export type { PartsParReseau };
