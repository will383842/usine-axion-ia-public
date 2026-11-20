/**
 * U-PORTE-SEMAINE · la semaine proposée, LUE par le Studio (porte), sans rien écrire.
 * Même tirage que `proposerLaSemaine` (règles pures de ./regles) : seules des lectures (calendrier, réglages, arrêt).
 * Ni jour déplacé au calendrier, ni commande au Studio, ni appel sortant, ni journal. Ne lit pas l'interrupteur de planification
 * (il garde l'envoi poussé) ; « Tout arrêter » est respecté. Aucune donnée de personne : ni compte, ni texte libre.
 */
import "server-only";
import { createHash } from "node:crypto";
import { estArrete } from "@/arret";
import { requete } from "@/lib/base";
import { lireQuotas, lireReglagesTirage } from "@/reglages";
import type { LigneSemainePorte, ReponseSemaine } from "@/contrats";
import { PHRASE_ARRET, SQL_LIGNES_SEMAINE, isoParis, lignesDeLaSemaine, proposerSemaine, type LigneBase } from "./regles";
import { ajouterJours } from "@/calendrier/regles";

export const POURQUOI_PROPOSITION = "Un créneau libre qui respecte le rythme et les quantités du réseau.";

/** Clé stable d'une proposition : la même semaine et la même ligne donnent toujours la même clé (rien d'autre n'y entre). */
export const cleSemaine = (lundi: string, ligne: string) => createHash("sha256").update(`semaine | ${lundi} | ${ligne}`).digest("hex");

/** `lundi` : un lundi « AAAA-MM-JJ » déjà contrôlé ; `reseaux` : seulement ces réseaux (absent : tous). */
export async function lireSemaineProposee(lundi: string, reseaux?: readonly string[], maintenant: Date = new Date()): Promise<ReponseSemaine> {
  if (await estArrete()) return { propositions: [], arrete: true, message: PHRASE_ARRET };
  const [{ rythmes }, quotas, lignes] = await Promise.all([lireReglagesTirage(), lireQuotas(), requete<LigneBase>(SQL_LIGNES_SEMAINE, [lundi, ajouterJours(lundi, 6)])]);
  const visees = lignesDeLaSemaine(lignes).filter((l) => !reseaux || reseaux.includes(l.reseau));
  // Les créneaux pris du Studio ne sont pas lus ici (aucun appel sortant) : seules les lignes fixes du calendrier comptent.
  const { propositions } = proposerSemaine({ lundi, lignes: visees, rythmes, quotas, occupes: [], maintenant });
  const lues: LigneSemainePorte[] = propositions.map((p) => ({
    cle: cleSemaine(lundi, p.ligne),
    jour: p.jour,
    reseau: p.reseau,
    type: p.type_contenu,
    heure: isoParis(p.instant).slice(11, 16),
    pourquoi: POURQUOI_PROPOSITION,
  }));
  return { propositions: lues };
}
