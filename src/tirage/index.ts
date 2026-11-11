/** Tirage des contenus d'un lot (T08). `tirer()` est pur ; `tirerDepuisLaBase()` lit la base et l'interrupteur. */
export { tirer } from "./tirer";
export { formatsDuTirage, STATUT_EN_SERVICE } from "./formats";
export { signature, type PartsSignature } from "./signature";
export { choisirFin, finsPermises, motBranchePour } from "./fins";
export type * from "./types";
