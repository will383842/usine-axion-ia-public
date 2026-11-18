/**
 * UO-04 · règles pures des écrans de suivi : libellés, formats de date, totaux. Ni base ni réseau.
 * Une donnée absente se dit « pas encore de donnée », jamais 0 ; une cellule masquée (moins de 3) n'est jamais comptée comme zéro.
 */
export const INTERRUPTEUR_SUIVI = "suivi";
export const PAS_ENCORE = "pas encore de donnée";

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

export const libelleDate = (d: Date | null | undefined): string => (d ? date.format(d) : PAS_ENCORE);
export const libelleNombre = (n: number | null | undefined): string => (n === null || n === undefined ? PAS_ENCORE : String(n));

/** Les cinq états d'une ligne de lot, dans l'ordre où un contenu avance. */
export const ETATS_LIGNE = [
  { code: "a_coller", libelle: "À coller" },
  { code: "collee", libelle: "Collés" },
  { code: "fabriquee", libelle: "Fabriqués" },
  { code: "publiee", libelle: "Publiés" },
  { code: "refusee", libelle: "Refusés" },
] as const;
export type EtatLigne = (typeof ETATS_LIGNE)[number]["code"];

export const RESEAUX_LIBELLES: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  "youtube-shorts": "YouTube Shorts",
};
export const CANAUX_LIBELLES: Record<string, string> = { tous: "Tous les canaux", instagram: "Instagram", facebook: "Facebook", email: "E-mail" };
export const libelleReseau = (r: string) => RESEAUX_LIBELLES[r] ?? r;

export interface CelluleTotal {
  /** null : toutes les cellules reçues sont masquées, ou aucune n'est reçue. */
  somme: number | null;
  /** Au moins une cellule masquée (moins de 3) : la somme est un minimum. */
  masquee: boolean;
}
export interface TotalReseau {
  reseau: string;
  demandes: CelluleTotal;
  guides_envoyes: CelluleTotal;
  accords: CelluleTotal;
}
interface EntreeTotal {
  reseau: string;
  demandes: number | null;
  guides_envoyes: number | null;
  accords: number | null;
}
const CLES = ["demandes", "guides_envoyes", "accords"] as const;

/** Somme par réseau ; l'ordre des réseaux suit leur première apparition. */
export function totauxParReseau(lignes: EntreeTotal[]): TotalReseau[] {
  const par = new Map<string, TotalReseau>();
  for (const l of lignes) {
    let t = par.get(l.reseau);
    if (!t) {
      t = { reseau: l.reseau, demandes: { somme: null, masquee: false }, guides_envoyes: { somme: null, masquee: false }, accords: { somme: null, masquee: false } };
      par.set(l.reseau, t);
    }
    for (const c of CLES) {
      const v = l[c];
      if (v === null) t[c].masquee = true;
      else t[c].somme = (t[c].somme ?? 0) + v;
    }
  }
  return [...par.values()];
}

/** « 8 », « 4 ou plus », « moins de 3 » (tout masqué), jamais « 0 » pour une cellule masquée. */
export function libelleTotal(c: CelluleTotal): string {
  if (c.somme === null) return c.masquee ? "moins de 3" : PAS_ENCORE;
  return c.masquee ? `${c.somme} ou plus` : String(c.somme);
}
