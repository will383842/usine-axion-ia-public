import "server-only";
import { depots, interrupteurAllume } from "@/donnees";
import { decider } from "./regles";

export const INTERRUPTEUR_MOTS = "mots";

/**
 * Le mot est-il branché sur ce compte (`instagram:williamsjullin`) ? Éteint, non branché ou réseau refusé : non.
 * Lu par la répartition des lots avant de mettre un mot dans la fin d'une vidéo.
 */
export async function motBranche(mot: string, compte: string): Promise<boolean> {
  if (!(await interrupteurAllume(INTERRUPTEUR_MOTS))) return false;
  const lignes = await depots.mot_branche.lister({ ou: { mot: mot.toUpperCase() } });
  return decider(lignes, mot, compte);
}
