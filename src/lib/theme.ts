/** Thèmes de l'Usine : clair par défaut, sombre au choix. Le choix reste dans le navigateur (jamais d'erreur si le stockage est fermé). */
export const THEMES = ["clair", "sombre"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_DEFAUT: Theme = "clair";
export const CLE_THEME = "usine.theme";

export interface Stockage {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

export function themeValide(valeur: string | null | undefined): Theme {
  return (THEMES as readonly string[]).includes(valeur ?? "") ? (valeur as Theme) : THEME_DEFAUT;
}

export function lireTheme(stockage: Stockage): Theme {
  try {
    return themeValide(stockage.getItem(CLE_THEME));
  } catch {
    return THEME_DEFAUT;
  }
}

export function ecrireTheme(theme: Theme, stockage: Stockage): void {
  try {
    stockage.setItem(CLE_THEME, theme);
  } catch {
    /* stockage fermé : le thème vaut pour cette visite seulement */
  }
}

/** Pose le thème sur la page (attribut `data-theme` de <html>). */
export function appliquerTheme(theme: Theme, racine: { setAttribute(nom: string, valeur: string): void }): void {
  racine.setAttribute("data-theme", theme);
}
