/**
 * T07 · Réglages du tirage : parts de format par réseau, poids, rythmes, plafond par défaut.
 * Fonctions pures (aucun accès à la base) : valeurs de départ de PLAN-MAITRE.md C3 et de la décision « plafond par lot : 40 € ».
 */
import { CODES_SERVICE, CODES_TAILLE, RESEAUX, type CodeService, type CodeTaille, type Reseau, type TypeContenu } from "@/contrats";

/** Les quatre formats dont on règle la part (valeurs de `type_contenu`). */
export const FORMATS_PART = ["video", "carrousel", "image", "texte"] as const satisfies readonly TypeContenu[];
export type FormatPart = (typeof FORMATS_PART)[number];

export const LIBELLE_FORMAT: Record<FormatPart, string> = {
  video: "Vidéo",
  carrousel: "Carrousel",
  image: "Texte avec image",
  texte: "Texte seul",
};

/** Seule la vidéo est en série au départ ; les autres sont affichées « bientôt » et comptent pour zéro. */
export const FORMATS_EN_SERVICE: readonly FormatPart[] = ["video"];

/**
 * L7-21 · Types que le tirage sait placer : un type de plus par PR, le texte avec image en premier.
 * Distinct de `FORMATS_EN_SERVICE` (écran des parts) tant que la part de ce type n'est pas ouverte au fondateur.
 */
export const FORMATS_TIRAGE_EN_SERVICE: readonly FormatPart[] = ["video", "image"];

export const LIBELLE_RESEAU: Record<Reseau, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  "youtube-shorts": "YouTube Shorts",
};

export const LIBELLE_SERVICE: Record<CodeService, string> = {
  formation: "Formation",
  audit: "Audit",
  coaching: "Coaching",
  integration: "Intégration",
};

export const CLES = {
  parts: "parts_formats",
  rythmes: "rythmes",
  actualites: "rythme_actualites",
  poidsTaille: "poids_taille",
  poidsService: "poids_service",
  plafond: "plafond_lot_defaut",
} as const;

export type Parts = Record<FormatPart, number>;
export type PartsParReseau = Record<Reseau, Parts>;
export interface Rythme {
  min: number;
  max: number;
}
export type RythmesParReseau = Record<Reseau, Rythme>;

export const PLAFOND_LOT_DEFAUT_EUR = 40;
export const ACTUALITES_PAR_SEMAINE_DEFAUT = 1;
export const RYTHME_MAX_PAR_SEMAINE = 30;

/** Rythme de départ par semaine (C3) ; YouTube long : plus tard. */
export const RYTHMES_DEFAUT: RythmesParReseau = {
  instagram: { min: 5, max: 7 },
  facebook: { min: 5, max: 7 },
  tiktok: { min: 0, max: 10 },
  "youtube-shorts": { min: 5, max: 7 },
  linkedin: { min: 2, max: 4 },
  youtube: { min: 0, max: 0 },
};

function entierPositif(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Part de départ : tout sur le premier format en service (la vidéo). */
export function partsDefaut(enService: readonly FormatPart[] = FORMATS_EN_SERVICE): Parts {
  const parts: Parts = { video: 0, carrousel: 0, image: 0, texte: 0 };
  if (enService.length === 0) return parts;
  const base = Math.floor(100 / enService.length);
  enService.forEach((f, i) => (parts[f] = base + (i === 0 ? 100 - base * enService.length : 0)));
  return parts;
}

/**
 * Parts effectives d'un réseau : un format « bientôt » compte pour zéro, les parts sont des entiers,
 * et leur somme fait toujours 100 (répartition au plus fort reste ; somme nulle → valeur de départ).
 */
export function normaliserParts(brut: Partial<Record<FormatPart, unknown>> | null | undefined, enService: readonly FormatPart[] = FORMATS_EN_SERVICE): Parts {
  const parts: Parts = { video: 0, carrousel: 0, image: 0, texte: 0 };
  const actifs = FORMATS_PART.filter((f) => enService.includes(f));
  const valeurs = actifs.map((f) => entierPositif(brut?.[f]));
  const somme = valeurs.reduce((a, b) => a + b, 0);
  if (somme === 0) return partsDefaut(enService);
  const exact = valeurs.map((v) => (v * 100) / somme);
  const bases = exact.map(Math.floor);
  let reste = 100 - bases.reduce((a, b) => a + b, 0);
  const ordre = exact.map((e, i) => ({ i, frac: e - bases[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of ordre) {
    if (reste <= 0) break;
    bases[i] += 1;
    reste -= 1;
  }
  actifs.forEach((f, i) => (parts[f] = bases[i]));
  return parts;
}

/** Saisie de Will : entiers, formats « bientôt » à zéro, somme exactement 100. Renvoie le message à afficher sinon. */
export function verifierParts(saisie: Parts, enService: readonly FormatPart[] = FORMATS_EN_SERVICE): string | null {
  for (const f of FORMATS_PART) {
    const v = saisie[f];
    if (!Number.isInteger(v) || v < 0 || v > 100) return "Chaque part est un nombre entier entre 0 et 100.";
    if (!enService.includes(f) && v !== 0) return `« ${LIBELLE_FORMAT[f]} » n'est pas encore en service : sa part reste à 0.`;
  }
  const somme = FORMATS_PART.reduce((a, f) => a + saisie[f], 0);
  return somme === 100 ? null : `Les parts d'un réseau doivent faire 100 % (ici ${somme} %).`;
}

export function partsParReseau(brut: unknown, enService: readonly FormatPart[] = FORMATS_EN_SERVICE): PartsParReseau {
  const source = (brut && typeof brut === "object" ? brut : {}) as Partial<Record<Reseau, Partial<Record<FormatPart, unknown>>>>;
  return Object.fromEntries(RESEAUX.map((r) => [r, normaliserParts(source[r], enService)])) as PartsParReseau;
}

export function verifierRythme(r: Rythme): string | null {
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= RYTHME_MAX_PAR_SEMAINE;
  if (!ok(r.min) || !ok(r.max)) return `Un rythme est un nombre entier de publications par semaine, de 0 à ${RYTHME_MAX_PAR_SEMAINE}.`;
  return r.min <= r.max ? null : "Le minimum ne peut pas dépasser le maximum.";
}

export function rythmesParReseau(brut: unknown): RythmesParReseau {
  const source = (brut && typeof brut === "object" ? brut : {}) as Partial<Record<Reseau, Partial<Rythme>>>;
  return Object.fromEntries(
    RESEAUX.map((r) => {
      const cand = { min: Number(source[r]?.min), max: Number(source[r]?.max) };
      return [r, verifierRythme(cand) === null ? cand : RYTHMES_DEFAUT[r]];
    }),
  ) as RythmesParReseau;
}

export function actualitesParSemaine(brut: unknown): number {
  const n = Number((brut as { par_semaine?: unknown } | null)?.par_semaine);
  return Number.isInteger(n) && n >= 0 && n <= 7 ? n : ACTUALITES_PAR_SEMAINE_DEFAUT;
}

export function plafondLot(brut: unknown): number {
  const n = Number((brut as { eur?: unknown } | null)?.eur);
  return Number.isFinite(n) && n > 0 ? n : PLAFOND_LOT_DEFAUT_EUR;
}

/** Poids de départ : tous égaux. */
export function poidsDefaut<K extends string>(codes: readonly K[]): Record<K, number> {
  return Object.fromEntries(codes.map((c) => [c, 25])) as Record<K, number>;
}

/** Poids : entiers de 0 à 100, au moins un non nul. */
export function verifierPoids(poids: Record<string, number>): string | null {
  const valeurs = Object.values(poids);
  if (valeurs.some((v) => !Number.isInteger(v) || v < 0 || v > 100)) return "Chaque poids est un nombre entier entre 0 et 100.";
  return valeurs.some((v) => v > 0) ? null : "Au moins un poids doit être supérieur à 0.";
}

function poidsLus<K extends string>(brut: unknown, codes: readonly K[]): Record<K, number> {
  const source = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const lus = Object.fromEntries(codes.map((c) => [c, Number(source[c])])) as Record<K, number>;
  return verifierPoids(lus) === null ? lus : poidsDefaut(codes);
}
export const poidsTailleLus = (brut: unknown) => poidsLus<CodeTaille>(brut, CODES_TAILLE);
export const poidsServiceLus = (brut: unknown) => poidsLus<CodeService>(brut, CODES_SERVICE);

/** Le lien d'un profil : une adresse https, rien d'autre. */
export function verifierLienProfil(lien: string): string | null {
  if (lien === "") return null;
  try {
    const u = new URL(lien);
    if (u.protocol !== "https:" || u.username || u.password) return "Le lien du profil commence par https://.";
  } catch {
    return "Le lien du profil commence par https://.";
  }
  return lien.length <= 300 ? null : "Le lien du profil est trop long.";
}
