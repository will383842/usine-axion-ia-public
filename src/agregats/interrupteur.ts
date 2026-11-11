/** Interrupteur du récepteur des chiffres du CRM : éteint par défaut ; absent, archivé ou illisible vaut « éteint ». */
import "server-only";
import { interrupteurAllume } from "@/donnees";

export const CODE_RECEPTEUR = "agregats.recepteur";

export const recepteurAllume = (): Promise<boolean> => interrupteurAllume(CODE_RECEPTEUR);
