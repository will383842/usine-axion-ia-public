import { NATURES_COMPTE, RESEAUX, type NatureCompte, type Reseau } from "@/contrats";
import { estReseauEcarte } from "@/planification/reseaux-ecartes";
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
export type ChampCompte = "reseau" | "identifiant" | "nom" | "nature";

export function lireSaisieCompte(s: SaisieCompte): { ok: true; valeur: CompteValide } | { ok: false; message: string; champ: ChampCompte } {
  const reseau = RESEAUX.find((r) => r === s.reseau);
  if (!reseau) return { ok: false, champ: "reseau", message: "Choisissez un réseau de la liste." };
  const identifiant = s.identifiant.trim().toLowerCase();
  if (!identifiant) return { ok: false, champ: "identifiant", message: "Donnez un identifiant : c'est le nom du compte tel qu'il s'écrit sur le réseau." };
  if (identifiant.length > 100 || !IDENTIFIANT.test(identifiant))
    return { ok: false, champ: "identifiant", message: "L'identifiant ne prend que des lettres sans accent, des chiffres, des points, des tirets et des tirets bas, sans espace." };
  const nom = s.nom.trim();
  if (!nom || nom.length > 100) return { ok: false, champ: "nom", message: "Donnez un nom au compte (100 caractères au plus)." };
  const nature = NATURES_COMPTE.find((n) => n === s.nature);
  if (!nature) return { ok: false, champ: "nature", message: "Choisissez la nature du compte : profil, page ou compte." };
  return { ok: true, valeur: { code: `${reseau}:${identifiant}`, reseau, identifiant, nom, nature } };
}

/** « de » devant un nom : « d'Instagram » devant une voyelle, « de LinkedIn » ou « de YouTube » sinon (le « y » se prononce comme une consonne). */
export function deNom(nom: string): string {
  return /^[aeiouàâäéèêëîïôöùûü]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
}

/** Phrase d'avertissement quand éteindre ce compte retire le dernier compte actif de son réseau ; `null` sinon. Éteindre reste permis. */
export function avertissementDernierActif(
  comptes: readonly { code: string; reseau: string; actif: boolean; etat: string; archive_le: unknown }[],
  code: string,
): string | null {
  const c = comptes.find((x) => x.code === code);
  if (!c || !c.actif || estReseauEcarte(c.reseau)) return null;
  const autres = comptes.some((x) => x.code !== code && x.reseau === c.reseau && x.actif && x.etat !== "retire" && !x.archive_le);
  if (autres) return null;
  const nom = LIBELLE_RESEAU[c.reseau as Reseau] ?? c.reseau;
  return `C'est le dernier compte actif ${deNom(nom)} : une fois éteint, ${nom} ne recevra plus de propositions de la semaine.`;
}
