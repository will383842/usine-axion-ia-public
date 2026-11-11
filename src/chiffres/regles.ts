/** T14 · Règles des chiffres par mot, sans accès à la base : semaine, saisie, rapport, courbe. Les semaines sont des lundis « AAAA-MM-JJ ». */
import { z } from "zod";

export const INTERRUPTEUR_CHIFFRES = "chiffres";
export const INTERRUPTEUR_CARTE_RELEVE = "ma-journee.releve-mot";
/** Réseaux où un mot peut être branché (contrat § 7). */
export const RESEAUX_DES_MOTS = ["instagram", "facebook"] as const;
/** Nombre de semaines tracées sur la courbe d'un mot. */
export const SEMAINES_COURBE = 8;
/** Fenêtre du rapport « abonnés gagnés contre demandes de guide ». */
export const SEMAINES_RAPPORT = 4;

const JOUR = 86_400_000;
const enMs = (j: string) => Date.parse(`${j}T00:00:00Z`);
const enJour = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const jourValide = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && enJour(enMs(v)) === v;
export const ajouterJours = (j: string, n: number) => enJour(enMs(j) + n * JOUR);
export function lundiDe(jour: string): string {
  const dow = new Date(enMs(jour)).getUTCDay();
  return ajouterJours(jour, -((dow + 6) % 7));
}

const entier = (nom: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? 0 : Number(v)) : v),
    z.number({ error: `${nom} : un nombre entier.` }).int(`${nom} : un nombre entier.`).min(0, `${nom} : zéro ou plus.`).max(1_000_000, `${nom} : trop grand.`),
  );

/** Ce que Will saisit pour un mot et un compte sur une semaine (vide = 0). */
export const schemaReleve = z.object({
  semaine: z.string().refine(jourValide, "Semaine invalide.").transform(lundiDe),
  mot: z.string().regex(/^mot-[a-z0-9-]+$/, "Mot inconnu."),
  compte: z.string().regex(/^[a-z-]+:[a-z0-9._-]+$/, "Compte inconnu."),
  commentaires: entier("Commentaires au mot"),
  messages: entier("Messages partis"),
  demandesGuide: entier("Demandes de guide"),
  abonnesGagnes: entier("Abonnés gagnés"),
});
export type Releve = z.infer<typeof schemaReleve>;

export const schemaObjectif = z.object({
  compte: z.string().regex(/^[a-z-]+:[a-z0-9._-]+$/, "Compte inconnu."),
  objectif: z.string().trim().max(200, "200 signes au plus."),
});

export interface LigneReleve {
  semaine: string;
  commentaires: number;
  messages: number;
  demandes_guide: number;
  abonnes_gagnes: number;
}

/** Une semaine de la courbe d'un mot, tous comptes ensemble (0 si rien n'a été saisi). */
export interface PointSemaine extends Omit<LigneReleve, "semaine"> {
  semaine: string;
  saisie: boolean;
}

/** Les `n` dernières semaines jusqu'à `finLundi` (comprise), additionnées sur les comptes. */
export function serieDuMot(lignes: LigneReleve[], finLundi: string, n = SEMAINES_COURBE): PointSemaine[] {
  const points: PointSemaine[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const semaine = ajouterJours(finLundi, -7 * i);
    const dedans = lignes.filter((l) => l.semaine === semaine);
    points.push({
      semaine,
      saisie: dedans.length > 0,
      commentaires: dedans.reduce((a, l) => a + l.commentaires, 0),
      messages: dedans.reduce((a, l) => a + l.messages, 0),
      demandes_guide: dedans.reduce((a, l) => a + l.demandes_guide, 0),
      abonnes_gagnes: dedans.reduce((a, l) => a + l.abonnes_gagnes, 0),
    });
  }
  return points;
}

export interface Rapport {
  abonnesGagnes: number;
  demandesGuide: number;
  /** Abonnés gagnés pour une demande de guide ; null s'il n'y a aucune demande. */
  abonnesParDemande: number | null;
}

/** Rapport « abonnés gagnés contre demandes de guide » sur les dernières semaines de la série. */
export function rapportDuMot(serie: PointSemaine[], semaines = SEMAINES_RAPPORT): Rapport {
  const fin = serie.slice(-semaines);
  const abonnesGagnes = fin.reduce((a, p) => a + p.abonnes_gagnes, 0);
  const demandesGuide = fin.reduce((a, p) => a + p.demandes_guide, 0);
  return { abonnesGagnes, demandesGuide, abonnesParDemande: demandesGuide > 0 ? Math.round((abonnesGagnes / demandesGuide) * 10) / 10 : null };
}

/** Points d'une courbe pour une boîte `largeur` × `hauteur` : (x, y) en px, y vers le bas ; échelle commune de 0 au plus haut. */
export function pointsDeCourbe(valeurs: number[], haut: number, largeur: number, hauteur: number): { x: number; y: number }[] {
  const max = Math.max(1, haut);
  return valeurs.map((v, i) => ({ x: valeurs.length === 1 ? largeur / 2 : (i * largeur) / (valeurs.length - 1), y: hauteur - (v / max) * hauteur }));
}
