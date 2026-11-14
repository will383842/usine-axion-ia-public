/**
 * U-QUOTA · Quotas de production, en QUANTITÉS, par jour ou par semaine (jamais par mois),
 * par réseau et par type de contenu. Fonctions pures : aucun accès à la base, aucun appel sortant.
 * Aucune somme d'argent ici : le corps destiné à la porte ne porte que des quantités.
 */
import { z } from "zod";
import { RESEAUX, reseau, typeContenu, type Reseau, type TypeContenu } from "@/contrats";

/** Types suivis : la vidéo, le carrousel et l'infographie (type `image`). */
export const TYPES_QUOTA = ["video", "carrousel", "image"] as const satisfies readonly TypeContenu[];
export type TypeQuota = (typeof TYPES_QUOTA)[number];
export const PERIODES_QUOTA = ["jour", "semaine"] as const;
export type PeriodeQuota = (typeof PERIODES_QUOTA)[number];

export const LIBELLE_TYPE_QUOTA: Record<TypeQuota, string> = { video: "Vidéos", carrousel: "Carrousels", image: "Infographies" };
export const LIBELLE_PERIODE: Record<PeriodeQuota, string> = { jour: "par jour", semaine: "par semaine" };

export const CLE_QUOTAS = "quotas_production";
export const QUANTITE_QUOTA_MAX = 99;

export interface Quota {
  periode: PeriodeQuota;
  quantite: number;
}
export type QuotasReseau = Record<TypeQuota, Quota>;
export type QuotasParReseau = Record<Reseau, QuotasReseau>;

function departReseau(r: Reseau): QuotasReseau {
  return {
    video: { periode: "jour", quantite: r === "instagram" ? 2 : 1 },
    carrousel: { periode: "semaine", quantite: 1 },
    image: { periode: "semaine", quantite: 2 },
  };
}
/** Valeurs de départ : vidéo 1 par jour (Instagram 2), carrousel 1 par semaine, infographie 2 par semaine. */
export const QUOTAS_DEFAUT: QuotasParReseau = Object.fromEntries(RESEAUX.map((r) => [r, departReseau(r)])) as QuotasParReseau;

export function verifierQuota(q: Quota): string | null {
  if (!PERIODES_QUOTA.includes(q.periode)) return "Un quota se règle par jour ou par semaine.";
  if (!Number.isInteger(q.quantite) || q.quantite < 0 || q.quantite > QUANTITE_QUOTA_MAX) {
    return `Un quota est un nombre entier de 0 à ${QUANTITE_QUOTA_MAX}.`;
  }
  return null;
}

/** Relit ce qui est enregistré ; toute valeur illisible retombe sur la valeur de départ. */
export function quotasParReseau(brut: unknown): QuotasParReseau {
  const source = (brut && typeof brut === "object" ? brut : {}) as Partial<Record<Reseau, Partial<Record<TypeQuota, Partial<Quota>>>>>;
  return Object.fromEntries(
    RESEAUX.map((r) => [
      r,
      Object.fromEntries(
        TYPES_QUOTA.map((t) => {
          const q = source[r]?.[t];
          const cand = { periode: q?.periode as PeriodeQuota, quantite: typeof q?.quantite === "number" ? q.quantite : Number.NaN };
          return [t, verifierQuota(cand) === null ? cand : QUOTAS_DEFAUT[r][t]];
        }),
      ),
    ]),
  ) as QuotasParReseau;
}

export type Palier = 0 | 50 | 80 | 100;

/** Palier d'alerte atteint : 0 (rien), 50, 80 ou 100 % de la quantité. */
export function alerteQuota(quota: Quota, fait: number): Palier {
  if (quota.quantite <= 0) return 100;
  const pct = (fait * 100) / quota.quantite;
  return pct >= 100 ? 100 : pct >= 80 ? 80 : pct >= 50 ? 50 : 0;
}

export interface Projection {
  fait: number;
  reste: number;
  pourcentage: number;
  palier: Palier;
  /** Total si la commande en cours passe. */
  apres: number;
  depassement: number;
  palier_apres: Palier;
}

export function projeter(quota: Quota, fait: number, ajout = 0): Projection {
  const apres = fait + ajout;
  return {
    fait,
    reste: Math.max(0, quota.quantite - fait),
    pourcentage: quota.quantite > 0 ? Math.floor((fait * 100) / quota.quantite) : 100,
    palier: alerteQuota(quota, fait),
    apres,
    depassement: Math.max(0, apres - quota.quantite),
    palier_apres: alerteQuota(quota, apres),
  };
}

/** `debloquee` : commande mise de côté puis débloquée ; elle passe comme une commande à la main et n'est jamais remise de côté. */
export type OrigineCommande = "automatique" | "main" | "debloquee";
export interface Decision {
  decision: "passe" | "mise_de_cote";
  quantite: number;
}

/** Au-delà de 100 %, une commande automatique est mise de côté (jamais refusée) ; une commande à la main ou débloquée passe toujours.
 * Une quantité qui n'est pas un entier d'au moins 1 est refusée par une erreur claire (jamais « passe » en silence). */
export function decider(quota: Quota, fait: number, quantite: number, origine: OrigineCommande): Decision {
  if (!Number.isInteger(quantite) || quantite < 1) throw new RangeError("Une commande demande au moins une pièce.");
  if (origine === "main" || origine === "debloquee") return { decision: "passe", quantite };
  return { decision: fait + quantite > quota.quantite ? "mise_de_cote" : "passe", quantite };
}

export interface Demande {
  id: string;
  quantite: number;
}
/**
 * Répartit des demandes dans l'ordre : rien n'est perdu, ce qui dépasse est mis de côté.
 * L'ordre n'est pas strict : une grosse demande qui dépasse est mise de côté et une petite qui la suit peut encore passer
 * (à garder en tête pour U-COMMANDE, qui tient le journal des mises de côté).
 */
export function repartir(quota: Quota, fait: number, demandes: readonly Demande[], origine: OrigineCommande) {
  const passent: Demande[] = [];
  const misesDeCote: Demande[] = [];
  let total = fait;
  for (const d of demandes) {
    if (decider(quota, total, d.quantite, origine).decision === "passe") {
      passent.push(d);
      total += d.quantite;
    } else misesDeCote.push(d);
  }
  return { passent, misesDeCote };
}

export interface MiseDeCote extends Demande {
  etat: "mise_de_cote" | "debloquee";
}
/** Un clic : la commande mise de côté repart telle quelle. */
export function debloquer(m: MiseDeCote): MiseDeCote {
  return { ...m, etat: "debloquee" };
}

/**
 * INTERNE jusqu'à U-COMMANDE : corps destiné à la porte, sans ligne dans `CONTRATS-ECHANGE.md` ni dans `src/contrats/`.
 * Ne pas l'appeler depuis un autre module avant que U-COMMANDE ajoute sa ligne de contrat (puis le déplacer dans `src/contrats/`).
 * Des quantités seulement, aucun champ en euros ni en centimes.
 */
export const corpsCommandeSchema = z.strictObject({
  reseau,
  type_contenu: typeContenu,
  quantite: z.number().int().min(0).max(QUANTITE_QUOTA_MAX),
  periode: z.enum(PERIODES_QUOTA),
});
export type CorpsCommande = z.infer<typeof corpsCommandeSchema>;

export function corpsCommande(r: Reseau, type: TypeQuota, quota: Quota): CorpsCommande {
  return corpsCommandeSchema.parse({ reseau: r, type_contenu: type, quantite: quota.quantite, periode: quota.periode });
}
