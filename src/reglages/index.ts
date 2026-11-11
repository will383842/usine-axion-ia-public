/** T07 · Lecture des réglages du tirage, chacun avec sa valeur de départ. */
import "server-only";
import { lireReglage } from "@/donnees";
import { CLES, actualitesParSemaine, partsParReseau, plafondLot, poidsServiceLus, poidsTailleLus, rythmesParReseau } from "./modele";

export async function lireReglagesTirage() {
  const [parts, rythmes, actu, taille, service, plafond] = await Promise.all([
    lireReglage<unknown>(CLES.parts, null),
    lireReglage<unknown>(CLES.rythmes, null),
    lireReglage<unknown>(CLES.actualites, null),
    lireReglage<unknown>(CLES.poidsTaille, null),
    lireReglage<unknown>(CLES.poidsService, null),
    lireReglage<unknown>(CLES.plafond, null),
  ]);
  return {
    parts: partsParReseau(parts),
    rythmes: rythmesParReseau(rythmes),
    actualitesParSemaine: actualitesParSemaine(actu),
    poidsTaille: poidsTailleLus(taille),
    poidsService: poidsServiceLus(service),
    plafondLotEur: plafondLot(plafond),
  };
}
export type ReglagesTirage = Awaited<ReturnType<typeof lireReglagesTirage>>;
export * from "./modele";
