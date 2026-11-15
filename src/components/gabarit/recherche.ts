import { MENU, REGLAGES } from "./navigation";

/** Recherche Ctrl K : les pages de l'Usine, trouvées par leur nom ou leur phrase, sans tenir compte des accents ni de la casse. */
export interface EntreeRecherche {
  href: string;
  libelle: string;
  phrase: string;
}

export const ENTREES_RECHERCHE: readonly EntreeRecherche[] = [...MENU, REGLAGES].map((e) => ({ href: e.href, libelle: e.libelle, phrase: e.phrase }));

export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function rechercher(saisie: string, entrees: readonly EntreeRecherche[]): EntreeRecherche[] {
  const mots = normaliser(saisie).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [...entrees];
  return entrees.filter((e) => {
    const foin = normaliser(`${e.libelle} ${e.phrase}`);
    return mots.every((m) => foin.includes(m));
  });
}

export function estRaccourciRecherche(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
}
