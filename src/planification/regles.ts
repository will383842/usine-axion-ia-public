/**
 * U-PLANIF · règles pures de la semaine proposée : tirage SANS IA (ordre fixe, aucun hasard), rythmes, quotas, anti-répétition,
 * créneaux déjà occupés du Studio. Ni base ni réseau. Les heures sont celles de Paris.
 */
import { createHash } from "crypto";
import { z } from "zod";
import { ajouterJours, parSemaine } from "@/calendrier/regles";
import { reseau, type Reseau } from "@/contrats";
import type { QuotasParReseau } from "@/reglages/quotas";
import type { RythmesParReseau } from "@/reglages/modele";

export const INTERRUPTEUR_PLANIFICATION = "planification";
export const HEURES = ["09:00", "12:30", "18:00"] as const;
/** Deux publications d'un même réseau ne se touchent pas : écart minimal en minutes. */
export const ECART_MINUTES = 90;
export const PROPOSITIONS_MAX = 10;

export const PHRASE_ETEINT = "L'écran « Ma semaine » est éteint : allumez-le dans Réglages › Interrupteurs.";
export const PHRASE_ARRET = "Tout est arrêté : rien n'est parti.";
export const PHRASE_PAS_BRANCHE = "Le Studio n'est pas encore branché : rien n'est parti.";
export const PHRASE_SANS_OCCUPES = "Je n'ai pas pu lire les créneaux déjà pris dans le Studio : rien n'est proposé, pour ne pas viser une date prise.";

const PAD = (n: number) => String(n).padStart(2, "0");

/** Décalage de Paris à un instant, en minutes (60 ou 120). */
function decalageParis(instant: Date): number {
  const nom = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", timeZoneName: "longOffset" }).formatToParts(instant).find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nom);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 60;
}

/** Instant UTC d'un jour « AAAA-MM-JJ » à une heure « HH:MM » de Paris. */
export function instantDeParis(jour: string, heure: string): Date {
  const brut = Date.parse(`${jour}T${heure}:00Z`);
  const premier = brut - decalageParis(new Date(brut)) * 60_000;
  return new Date(brut - decalageParis(new Date(premier)) * 60_000);
}

/** ISO 8601 avec décalage (« 2026-11-20T09:00:00+01:00 ») d'un instant, à l'heure de Paris. */
export function isoParis(instant: Date): string {
  const d = decalageParis(instant);
  const local = new Date(instant.getTime() + d * 60_000);
  const signe = d < 0 ? "-" : "+";
  const a = Math.abs(d);
  return `${local.toISOString().slice(0, 19)}${signe}${PAD(Math.floor(a / 60))}:${PAD(a % 60)}`;
}

export const jourParis = (instant: Date) => instant.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export interface LigneSemaine {
  id: string;
  reseau: Reseau;
  compte: string | null;
  type_contenu: string;
  /** Instant actuel de la ligne. */
  instant: Date;
  /** Vrai si le jour est celui du fondateur ou si la ligne est déjà au Studio : il ne bouge pas. */
  fixe: boolean;
}

export interface Occupe {
  reseau: string;
  debut: Date;
}

export interface Proposition {
  ligne: string;
  reseau: Reseau;
  compte: string;
  type_contenu: string;
  jour: string;
  instant: Date;
}
export interface Reportee {
  ligne: string;
  raison: string;
}
export interface EntreesSemaine {
  lundi: string;
  lignes: LigneSemaine[];
  rythmes: RythmesParReseau;
  quotas: QuotasParReseau;
  occupes: Occupe[];
  maintenant: Date;
}

/** Une ligne du calendrier telle que le tirage la lit (sélection de `SQL_LIGNES_SEMAINE`). */
export interface LigneBase {
  id: string;
  reseau: Reseau;
  compte: string | null;
  type_contenu: string;
  prevue_le: Date;
  etat: string;
  date_choisie: boolean;
  commandee: boolean;
  /** Brouillon, pas encore au Studio, dans l'avenir : seule une telle ligne peut être déplacée. */
  deplacable: boolean;
}

/** Lecture seule des lignes de la semaine ($1 = lundi, $2 = dimanche), partagée par l'envoi poussé et la proposition lue par le Studio. */
export const SQL_LIGNES_SEMAINE = `SELECT c.id::text, c.reseau, c.compte, c.type_contenu, c.prevue_le, c.etat, c.date_choisie,
              (c.etat = 'brouillon' AND (c.etat_studio IS NULL OR c.etat_studio = 'en_attente') AND c.prevue_le > now()) AS deplacable,
              EXISTS (SELECT 1 FROM commande_studio s WHERE s.calendrier_ligne = c.id AND s.archive_le IS NULL AND s.etat_envoi IN ('envoyee', 'mise_de_cote_studio')) AS commandee
         FROM calendrier_ligne c
        WHERE c.archive_le IS NULL AND c.etat <> 'echec' AND (c.prevue_le AT TIME ZONE 'Europe/Paris')::date BETWEEN $1::date AND $2::date
        ORDER BY c.id`;

/** Lignes de la base → entrées du tirage : un jour choisi, une ligne déjà commandée ou non déplaçable est fixe. */
export const lignesDeLaSemaine = (lignes: LigneBase[]): LigneSemaine[] =>
  lignes.map((l) => ({ id: l.id, reseau: l.reseau, compte: l.compte, type_contenu: l.type_contenu, instant: l.prevue_le, fixe: l.date_choisie || l.commandee || !l.deplacable }));

const proche = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < ECART_MINUTES * 60_000;

/**
 * Tire la semaine : les lignes sans jour fixe, dans l'ordre de leur numéro (aucun hasard, donc rejouable à l'identique),
 * reçoivent un créneau qui respecte, dans l'ordre : l'avenir, les créneaux pris du Studio, le rythme du réseau, le quota
 * du réseau et du type, puis l'anti-répétition (un même type sur un même réseau n'est pas posé deux jours de suite
 * tant qu'un autre jour est possible). Un jour fixé n'est jamais déplacé. Ce qui ne rentre pas est rendu avec sa raison.
 */
export function proposerSemaine(e: EntreesSemaine): { propositions: Proposition[]; reportees: Reportee[] } {
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(e.lundi, i));
  const fin = ajouterJours(e.lundi, 6);
  const dansLaSemaine = (i: Date) => {
    const j = jourParis(i);
    return j >= e.lundi && j <= fin;
  };
  // Instants déjà pris par réseau : ce que le Studio rend + les lignes fixes (sans compter deux fois un même instant).
  const pris = new Map<string, Date[]>();
  const poser = (r: string, d: Date) => {
    const liste = pris.get(r) ?? [];
    if (!liste.some((x) => x.getTime() === d.getTime())) liste.push(d);
    pris.set(r, liste);
  };
  for (const o of e.occupes) poser(o.reseau, o.debut);
  for (const l of e.lignes) if (l.fixe) poser(l.reseau, l.instant);

  // Ce qui est déjà posé, par réseau, type et jour (lignes fixes seulement : le Studio ne dit pas le type).
  const parJour = new Map<string, number>();
  const parSemaineTypee = new Map<string, number>();
  const cleJour = (r: string, t: string, j: string) => `${r}|${t}|${j}`;
  const cleSem = (r: string, t: string) => `${r}|${t}`;
  const compter = (r: string, t: string, j: string) => {
    parJour.set(cleJour(r, t, j), (parJour.get(cleJour(r, t, j)) ?? 0) + 1);
    parSemaineTypee.set(cleSem(r, t), (parSemaineTypee.get(cleSem(r, t)) ?? 0) + 1);
  };
  for (const l of e.lignes) if (l.fixe && dansLaSemaine(l.instant)) compter(l.reseau, l.type_contenu, jourParis(l.instant));

  const propositions: Proposition[] = [];
  const reportees: Reportee[] = [];
  const aTirer = e.lignes.filter((l) => !l.fixe).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

  for (const l of aTirer) {
    const rap = (raison: string) => reportees.push({ ligne: l.id, raison });
    if (!l.compte) {
      rap("Choisissez d'abord le compte.");
      continue;
    }
    if (l.reseau === "youtube" || l.reseau === "youtube-shorts") {
      rap("YouTube est éteint pour l'instant.");
      continue;
    }
    const cap = parSemaine(e.rythmes[l.reseau]);
    if (cap === 0) {
      rap("Ce réseau est au repos : son rythme est à zéro.");
      continue;
    }
    const dejaReseau = (pris.get(l.reseau) ?? []).filter(dansLaSemaine).length;
    if (dejaReseau >= cap) {
      rap("Le rythme de la semaine est atteint pour ce réseau.");
      continue;
    }
    const quota = (e.quotas[l.reseau] as Record<string, { periode: string; quantite: number }> | undefined)?.[l.type_contenu];
    let parJourMax = 1;
    if (quota) {
      if (quota.quantite <= 0) {
        rap("Le quota de ce type est à zéro sur ce réseau.");
        continue;
      }
      if (quota.periode === "semaine" && (parSemaineTypee.get(cleSem(l.reseau, l.type_contenu)) ?? 0) >= quota.quantite) {
        rap("Le quota de la semaine est atteint pour ce type et ce réseau.");
        continue;
      }
      if (quota.periode === "jour") parJourMax = quota.quantite;
    }

    let meilleur: { jour: string; instant: Date; note: number } | null = null;
    jours.forEach((jour, rang) => {
      if ((parJour.get(cleJour(l.reseau, l.type_contenu, jour)) ?? 0) >= parJourMax) return;
      const voisin = (j: string) => (parJour.get(cleJour(l.reseau, l.type_contenu, j)) ?? 0) > 0;
      const adjacent = (rang > 0 && voisin(jours[rang - 1])) || (rang < 6 && voisin(jours[rang + 1]));
      const memeJourReseau = (pris.get(l.reseau) ?? []).filter((d) => jourParis(d) === jour).length;
      for (const h of HEURES) {
        const instant = instantDeParis(jour, h);
        if (instant.getTime() <= e.maintenant.getTime()) continue;
        if ((pris.get(l.reseau) ?? []).some((d) => proche(d, instant))) continue;
        // Étaler : peu de publications ce jour-là sur ce réseau, pas de même type la veille ou le lendemain, puis le plus tôt.
        const note = memeJourReseau * 100 + (adjacent ? 1000 : 0) + rang;
        if (!meilleur || note < meilleur.note) meilleur = { jour, instant, note };
        break;
      }
    });
    const choix = meilleur as { jour: string; instant: Date; note: number } | null;
    if (!choix) {
      rap("Aucun créneau libre cette semaine pour ce réseau.");
      continue;
    }
    propositions.push({ ligne: l.id, reseau: l.reseau, compte: l.compte, type_contenu: l.type_contenu, jour: choix.jour, instant: choix.instant });
    poser(l.reseau, choix.instant);
    compter(l.reseau, l.type_contenu, choix.jour);
  }
  return { propositions, reportees };
}

/** Clé de proposition de l'appel 4 : SHA-256 de « cle_commande | reseau | compte ». */
export const cleProposition = (cleCommande: string, r: string, compte: string) => createHash("sha256").update(`${cleCommande} | ${r} | ${compte}`).digest("hex");

/** PropositionCalendrier (appel 4 du contrat) : ces champs et aucun autre ; ni montant, ni état, ni diffuseur. */
export const propositionCalendrier = z.strictObject({
  cle_proposition: z.string().regex(/^[0-9a-f]{64}$/),
  reseau,
  compte: z.string().min(1).max(200),
  type_contenu: z.string().min(1).max(50),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/),
  jour_vise: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  origine: z.literal("usine"),
});
export type PropositionCalendrier = z.infer<typeof propositionCalendrier>;

export const corpsProgrammations = z.strictObject({ contrat: z.literal(2), propositions: z.array(propositionCalendrier).min(1).max(PROPOSITIONS_MAX) });
export type CorpsProgrammations = z.infer<typeof corpsProgrammations>;

/** Corps de l'appel 4 pour une commande ; `null` si la ligne n'est pas prête (compte absent, date passée, réseau éteint). */
export function corpsDeProposition(cleCommande: string, l: { reseau: string; compte: string | null; type_contenu: string; instant: Date }, maintenant: Date): CorpsProgrammations | null {
  if (!l.compte || l.instant.getTime() <= maintenant.getTime()) return null;
  const lu = corpsProgrammations.safeParse({
    contrat: 2,
    propositions: [
      {
        cle_proposition: cleProposition(cleCommande, l.reseau, l.compte),
        reseau: l.reseau,
        compte: l.compte,
        type_contenu: l.type_contenu,
        dueAt: isoParis(l.instant),
        jour_vise: jourParis(l.instant),
        origine: "usine",
      },
    ],
  });
  return lu.success ? lu.data : null;
}

/** Réponse de l'appel 7 → créneaux pris, ou `null` si elle n'est pas comprise (alors rien n'est proposé). */
export function lireOccupes(statut: number, corps: unknown): Occupe[] | null {
  if (statut !== 200) return null;
  const lu = z.array(z.object({ reseau: z.string(), debut: z.string() })).safeParse(corps);
  if (!lu.success) return null;
  const sortie = lu.data.map((o) => ({ reseau: o.reseau, debut: new Date(o.debut) }));
  return sortie.some((o) => Number.isNaN(o.debut.getTime())) ? null : sortie;
}

/** Réponse de l'appel 4 : accepté si le Studio rend 200 ou 201 avec la liste des entrées. */
export const reponseCalendrier = z.object({ deja: z.boolean().optional(), entrees: z.array(z.object({ cle_proposition: z.string(), origine_date: z.enum(["usine", "fondateur"]) }).passthrough()) });
export const programmationAcceptee = (statut: number, corps: unknown) => (statut === 200 || statut === 201) && reponseCalendrier.safeParse(corps).success;
