import { NATURES_COMPTE, RESEAUX, type NatureCompte, type Reseau } from "@/contrats";
import { LIBELLE_RESEAU } from "@/reglages/modele";

/** Même motif que la contrainte `compte_code_check` de la base (la partie après « réseau: »). */
const IDENTIFIANT = /^[a-z0-9._-]+$/;

export interface SaisieCompte {
  reseau: string;
  identifiant: string;
  nom: string;
  nature: string;
}
export interface CompteValide {
  code: string;
  reseau: Reseau;
  identifiant: string;
  nom: string;
  nature: NatureCompte;
}

/** Contrôle la saisie « Ajouter un compte » : mêmes valeurs que les contraintes de la table `compte`. */
export function lireSaisieCompte(s: SaisieCompte): { ok: true; valeur: CompteValide } | { ok: false; message: string } {
  const reseau = RESEAUX.find((r) => r === s.reseau);
  if (!reseau) return { ok: false, message: "Choisissez un réseau de la liste." };
  const identifiant = String(s.identifiant ?? "").trim().toLowerCase();
  if (!identifiant || identifiant.length > 100 || !IDENTIFIANT.test(identifiant))
    return { ok: false, message: "L'identifiant ne prend que des lettres sans accent, des chiffres, des points, des tirets et des tirets bas, sans espace." };
  const nom = String(s.nom ?? "").trim();
  if (!nom || nom.length > 100) return { ok: false, message: "Donnez un nom au compte (100 caractères au plus)." };
  const nature = NATURES_COMPTE.find((n) => n === s.nature);
  if (!nature) return { ok: false, message: "Choisissez la nature du compte : profil, page ou compte." };
  return { ok: true, valeur: { code: `${reseau}:${identifiant}`, reseau, identifiant, nom, nature } };
}

/** Phrase d'avertissement quand éteindre ce compte retire le dernier compte actif de son réseau ; `null` sinon. Éteindre reste permis. */
export function avertissementDernierActif(
  comptes: readonly { code: string; reseau: string; actif: boolean; etat: string; archive_le: unknown }[],
  code: string,
): string | null {
  const c = comptes.find((x) => x.code === code);
  if (!c || !c.actif) return null;
  const autres = comptes.some((x) => x.code !== code && x.reseau === c.reseau && x.actif && x.etat !== "retire" && !x.archive_le);
  if (autres) return null;
  const nom = LIBELLE_RESEAU[c.reseau as Reseau] ?? c.reseau;
  return `C'est le dernier compte actif de ${nom} : une fois éteint, ${nom} ne recevra plus de propositions de la semaine.`;
}
