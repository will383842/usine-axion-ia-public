/**
 * L3d · Règles pures des chiffres agrégés du CRM (ADR contrat v3, § 5 et I5) : schéma du push, masquage du seuil <3, retard.
 * Aucune donnée de personne : des comptes par mot, compte et jour. Schéma STRICT : tout champ inconnu est refusé.
 */
import { z } from "zod";
import { reseau } from "@/contrats";
import { ajouterJours, jourValide } from "@/chiffres/regles";

export const VARIABLE_AGREGATS = "USINE_AGREGATS_CRM_SECRET";
export const VARIABLE_AGREGATS_IPS = "USINE_AGREGATS_CRM_IPS";
export const LONGUEUR_MIN_SECRET_AGREGATS = 32;
/** Corps du push : 500 lignes au plus (≈ 7 jours × quelques comptes × quelques mots), 128 Ko au plus. */
export const MAX_LIGNES = 500;
export const TAILLE_MAX_CORPS_AGREGATS = 128 * 1024;
/** Tolérance de l'horodatage signé (secondes). */
export const TOLERANCE_HORODATAGE_S = 300;
export const JOURS_RENDUS = 7;
export const SEUIL = 3;

export const CELLULES = ["demandes", "guides", "accords", "mises_a_l_ecart"] as const;
export type Cellule = (typeof CELLULES)[number];

/** Un nombre est >= 3 ; sous le seuil, le CRM envoie « <3 ». Un nombre 0, 1 ou 2 en clair est refusé (jamais recomposé). */
const cellule = z.union([z.number().int().min(SEUIL).max(1_000_000), z.literal("<3")]);
const jour = z.string().refine(jourValide, "Date AAAA-MM-JJ attendue.");

export const ligneAgregat = z.strictObject({
  jour,
  reseau,
  compte: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  mot: z.string().regex(/^[A-Za-z0-9_-]{2,40}$/),
  demandes: cellule,
  guides: cellule,
  accords: cellule,
  mises_a_l_ecart: cellule,
});
export type LigneAgregat = z.infer<typeof ligneAgregat>;

/** Un push = UN jour. `lignes` peut être vide (tout masqué côté CRM : le jour est alors reçu sans rien écrire). */
export const schemaPush = z
  .strictObject({
    jour,
    genere_le: z.iso.datetime({ offset: true }),
    lignes: z.array(ligneAgregat).max(MAX_LIGNES),
  })
  .refine((p) => p.lignes.every((l) => l.jour === p.jour), "Toutes les lignes portent le jour du push.")
  // Une ligne par (réseau, compte, mot) : un même nom de compte peut exister sur deux réseaux (le CRM le normalise à l'identique).
  .refine((p) => new Set(p.lignes.map((l) => `${l.reseau}|${l.compte}|${l.mot}`)).size === p.lignes.length, "Une ligne par réseau, compte et mot.");
export type PushAgregats = z.infer<typeof schemaPush>;

/**
 * Double masquage (I5) : une cellule <3 (« <3 », ou un nombre <3 reçu en clair) est masquée (null) ; si une SEULE cellule
 * de la ligne l'est, la plus petite des autres l'est aussi, pour qu'on ne la retrouve pas par différence.
 */
export function masquerLigne(v: Record<Cellule, number | "<3">): Record<Cellule, number | null> {
  const sortie = Object.fromEntries(CELLULES.map((c) => [c, typeof v[c] === "number" && v[c] >= SEUIL ? v[c] : null])) as Record<Cellule, number | null>;
  const masquees = CELLULES.filter((c) => sortie[c] === null);
  if (masquees.length === 1) {
    const [plusPetite] = CELLULES.filter((c) => sortie[c] !== null).sort((a, b) => (sortie[a] as number) - (sortie[b] as number));
    if (plusPetite) sortie[plusPetite] = null;
  }
  return sortie;
}

/** Retard : le dernier jour reçu est plus ancien que la veille (ou aucun jour reçu). Jours « AAAA-MM-JJ » (Paris). */
export function enRetard(dernierJour: string | null, aujourdhui: string): boolean {
  return dernierJour === null || dernierJour < ajouterJours(aujourdhui, -1);
}

/** Jour « AAAA-MM-JJ » en UTC pour un instant donné (ms) : le contrat du CRM compte les jours en UTC. */
export const jourUtcDe = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Seuls les jours de [aujourd'hui − 7 ; veille] (UTC) sont reçus. */
export const jourDansFenetre = (jour: string, aujourdhui: string): boolean => jour >= ajouterJours(aujourdhui, -JOURS_RENDUS) && jour <= ajouterJours(aujourdhui, -1);

/** I-2 : retard par compte. `derniers` = le dernier jour reçu de chaque compte ; le compte le plus en retard déclenche le bandeau. */
export function enRetardParCompte(derniers: (string | null)[], aujourdhui: string): boolean {
  return derniers.length === 0 || derniers.some((d) => enRetard(d, aujourdhui));
}
