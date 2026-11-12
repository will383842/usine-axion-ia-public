export const PASSERELLES: Record<string, string[]>;
export const MODULES_PERMIS: Set<string>;
export function motifsDepuisTexte(texte: string): { motifs: RegExp[]; fautes: string[] };
export function preparerMotifsPrives(chemin: string | undefined, lire: (chemin: string) => string, exigee: boolean): { motifs: RegExp[]; fautes: string[]; note: string | null };
export function listeMotsExigee(env: Record<string, string | undefined>): boolean;
export function fautesTracesPrivees(fichier: string, texte: string, motifs: RegExp[]): string[];
export function fautesSortantes(fichier: string, texte: string): string[];
