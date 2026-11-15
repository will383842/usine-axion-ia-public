import { RESEAUX, TYPES_CONTENU } from "@/contrats";

/** Filtres communs aux listes (calendrier, à valider, bibliothèque, suivi) : un réseau, une famille. */
export const RESEAUX_FILTRE = ["instagram", "facebook", "linkedin", "tiktok"] as const satisfies readonly (typeof RESEAUX)[number][];
export type ReseauFiltre = (typeof RESEAUX_FILTRE)[number];

export const FAMILLES = ["video", "infographie", "carrousel", "hors-famille"] as const;
export type Famille = (typeof FAMILLES)[number];

export const LIBELLE_RESEAU: Record<ReseauFiltre, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok" };
export const LIBELLE_FAMILLE: Record<Famille, string> = { video: "Vidéos", infographie: "Infographies", carrousel: "Carrousels", "hors-famille": "Hors famille" };

export interface Filtres {
  reseau: ReseauFiltre | null;
  famille: Famille | null;
}
export const FILTRES_VIDES: Filtres = { reseau: null, famille: null };

/** Famille d'un type du contrat : image et story sont des variantes de l'infographie, texte est hors famille. */
export function familleDeType(type: (typeof TYPES_CONTENU)[number] | string): Famille {
  if (type === "video") return "video";
  if (type === "carrousel") return "carrousel";
  if (type === "image" || type === "story") return "infographie";
  return "hors-famille";
}

export function filtrerListe<T extends { reseau: string; type: string }>(liste: readonly T[], filtres: Filtres): T[] {
  return liste.filter((x) => (!filtres.reseau || x.reseau === filtres.reseau) && (!filtres.famille || familleDeType(x.type) === filtres.famille));
}

export function lireFiltres(params: URLSearchParams): Filtres {
  const reseau = params.get("reseau");
  const famille = params.get("famille");
  return {
    reseau: (RESEAUX_FILTRE as readonly string[]).includes(reseau ?? "") ? (reseau as ReseauFiltre) : null,
    famille: (FAMILLES as readonly string[]).includes(famille ?? "") ? (famille as Famille) : null,
  };
}

export function versParametres(filtres: Filtres): URLSearchParams {
  const p = new URLSearchParams();
  if (filtres.reseau) p.set("reseau", filtres.reseau);
  if (filtres.famille) p.set("famille", filtres.famille);
  return p;
}
