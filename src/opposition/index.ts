/**
 * Opposition commune (STOP, contrat § 8) : une personne opposée ne reçoit plus rien sur ce canal,
 * ou sur aucun canal quand `canal = 'tous'`. Une opposition ne se retire jamais : on ne fait qu'ajouter.
 * Une adresse saisie n'est jamais écrite, ni en base ni au journal : seule son empreinte l'est.
 *
 * `estOpposee()` ne dépend d'aucun interrupteur : toute liste de personnes l'appelle, toujours.
 * L'interrupteur `opposition` n'ouvre que l'écran « Réglages › Oppositions ».
 */
import "server-only";
import { z } from "zod";
import { CANAUX_OPPOSITION, RESEAUX, SOURCES_OPPOSITION } from "@/contrats";
import { depots, journaliser, type OppositionLigne } from "@/donnees";
import { requete } from "@/lib/base";
import { cleDepuisSaisie, cleDeRecherche } from "./cle";

export { cleDepuisSaisie, cleDeRecherche, cleLisible, empreinteAdresse } from "./cle";

export const INTERRUPTEUR_OPPOSITION = "opposition";

export type CanalOpposition = (typeof CANAUX_OPPOSITION)[number];
export type SourceOpposition = (typeof SOURCES_OPPOSITION)[number];

/**
 * Vrai si la personne est opposée sur ce canal. La clé : empreinte d'adresse, ou compte (`<reseau>:<compte>`,
 * `@compte`, `compte`) ; un compte sans réseau prend `reseau`, sinon le canal quand c'est un réseau.
 * Une opposition sur `tous` vaut pour chaque canal ; demander `tous` = opposée sur au moins un canal.
 * Clé vide ou illisible, canal et réseau qui ne concordent pas, erreur de lecture : l'erreur remonte, l'appelant
 * n'envoie rien.
 */
export async function estOpposee(cle: string, canal: CanalOpposition, reseau?: string): Promise<boolean> {
  if (reseau && (canal === "instagram" || canal === "facebook") && reseau.trim().toLowerCase() !== canal) {
    throw new Error(`Canal ${canal} et réseau ${reseau} ne concordent pas.`);
  }
  const c = cleDeRecherche(cle, reseau ?? (canal === "instagram" || canal === "facebook" ? canal : undefined));
  const sql =
    canal === "tous"
      ? "SELECT 1 FROM opposition WHERE cle = $1 LIMIT 1"
      : "SELECT 1 FROM opposition WHERE cle = $1 AND canal IN ($2, 'tous') LIMIT 1";
  const lignes = await requete(sql, canal === "tous" ? [c] : [c, canal]);
  return lignes.length > 0;
}

export const saisieOpposition = z.object({
  /** Adresse ou compte tel que Will l'a saisi ; jamais gardé tel quel. */
  saisie: z.string().max(320),
  /** Réseau du compte, quand la saisie est un identifiant sans réseau. */
  reseau: z.enum(RESEAUX).optional(),
  canal: z.enum(CANAUX_OPPOSITION).default("tous"),
  source: z.enum(SOURCES_OPPOSITION).default("will"),
});
export type SaisieOpposition = z.input<typeof saisieOpposition>;

export type ResultatOpposition = { ok: true; deja: boolean } | { ok: false; message: string };

/** Ajoute une opposition depuis une saisie de Will. Le message rendu ne répète jamais la saisie. */
export async function ajouterOpposition(entree: SaisieOpposition): Promise<ResultatOpposition> {
  const lu = saisieOpposition.safeParse(entree);
  if (!lu.success) return { ok: false, message: "Saisie incomplète : vérifiez le canal et la source." };
  const cle = cleDepuisSaisie(lu.data.saisie, lu.data.reseau);
  if (!cle.ok) return cle;
  const ligne = await depots.opposition.ajouter({ cle: cle.cle, canal: lu.data.canal, source: lu.data.source });
  if (!ligne) return { ok: true, deja: true };
  await journaliser("opposition", `Opposition ajoutée (${cle.nature === "adresse" ? "adresse" : "compte"}, canal ${lu.data.canal}, source ${lu.data.source}).`, {
    cible: `opposition:${ligne.id}`,
  });
  return { ok: true, deja: false };
}

/** Les oppositions, les plus récentes d'abord. */
export async function listerOppositions(limite = 200): Promise<OppositionLigne[]> {
  return depots.opposition.lister({ ordre: "depuis", sens: "desc", limite });
}
