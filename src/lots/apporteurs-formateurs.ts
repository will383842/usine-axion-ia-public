/**
 * UO-14 · Contenus pour les apporteurs d'affaires et les formateurs : un par un, contrôlés, à valider.
 * Le tirage automatique reste réservé au public Clients (`LigneTiree.public`). Ici, module pur : rien n'est
 * enregistré, la ligne à valider vit en mémoire. Aucune validation n'est écrite en dur ni supposée.
 */
import { CODES_PUBLIC, type CodePublic, type Paquet } from "@/contrats";
import { controler, type ContexteControle, type ResultatControle } from "./controle";

const [CLIENTS, APPORTEURS, FORMATEURS] = CODES_PUBLIC;

/** Les publics qui se font un contenu à la fois. */
export type PublicUnitaire = typeof APPORTEURS | typeof FORMATEURS;

export const MENTION_A_VALIDER = "à valider par le fondateur";

/** Une ligne à valider : jamais commandable d'elle-même. */
export interface LigneUnitaire {
  public: PublicUnitaire;
  sujet: string;
  etat: "a_valider";
  mention: typeof MENTION_A_VALIDER;
}

/** La validation explicite du fondateur, passée en argument. */
export interface Validation {
  public: CodePublic;
  sujet: string;
  le: Date;
}

export type ResultatLigne = { ok: true; ligne: LigneUnitaire } | { ok: false; raison: string };

export function ligneUnitaire(public_: CodePublic, sujet: string): ResultatLigne {
  if (public_ === CLIENTS) {
    return { ok: false, raison: "Le public Clients se tire par lot : un contenu à la fois est réservé aux apporteurs d'affaires et aux formateurs." };
  }
  if (public_ !== APPORTEURS && public_ !== FORMATEURS) {
    return { ok: false, raison: "Ce public n'existe pas : choisissez les apporteurs d'affaires ou les formateurs." };
  }
  const texte = sujet.trim();
  if (!texte) return { ok: false, raison: "Le sujet est vide : écrivez de quoi parle ce contenu." };
  return { ok: true, ligne: { public: public_, sujet: texte, etat: "a_valider", mention: MENTION_A_VALIDER } };
}

/** Vrai seulement avec une validation du fondateur qui porte sur cette ligne. */
export function commandable(ligne: Pick<LigneUnitaire, "public" | "sujet">, validation?: Validation | null): boolean {
  return !!validation && validation.public === ligne.public && validation.sujet === ligne.sujet;
}

/** Contrôle le paquet de la ligne avec le public de la ligne (celui du contexte est ignoré). */
export function controlerLigne(ligne: Pick<LigneUnitaire, "public">, paquet: unknown, ctx: ContexteControle): ResultatControle {
  return controler(paquet as Paquet, { ...ctx, public: ligne.public });
}
