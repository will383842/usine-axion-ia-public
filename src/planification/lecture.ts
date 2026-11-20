/**
 * Semaine proposée, LUE par le Studio (porte), sans rien écrire : le tirage à la demande est dans ./semaine-tirage.
 * Seules des lectures (calendrier, comptes, bases, réglages, arrêt). Ni jour déplacé, ni commande au Studio, ni appel sortant, ni journal.
 * Ne lit pas l'interrupteur de planification (il garde l'envoi poussé) ; « Tout arrêter » est respecté (409 `arrete`).
 * Aucune donnée de personne : ni compte, ni texte libre ; les textes viennent des bases, comme pour `/sujets`.
 */
import "server-only";
import type { ReponseSemaine, Reseau } from "@/contrats";
import { tirerLaSemaine } from "./semaine-tirage";

export { POURQUOI_PROPOSITION, cleSemaine } from "./semaine-tirage";

/** `lundi` : un lundi « AAAA-MM-JJ » déjà contrôlé ; `reseaux` : seulement ces réseaux (absent : Instagram et Facebook). */
export const lireSemaineProposee = (lundi: string, reseaux?: readonly Reseau[], maintenant: Date = new Date()): Promise<ReponseSemaine> => tirerLaSemaine(lundi, reseaux, maintenant);
