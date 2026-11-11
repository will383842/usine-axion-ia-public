"use server";

import { revalidatePath } from "next/cache";
import { depots, journaliser } from "@/donnees";
import { exigerSession } from "@/services/auth";
import { CODES_ECRANS, ecranParCode } from "./ecrans";

async function allumer(code: string): Promise<boolean> {
  const ligne = await depots.interrupteur.lire(code);
  if (!ligne || ligne.archive_le || ligne.allume) return false;
  await depots.interrupteur.modifier(code, { allume: true });
  await journaliser("interrupteur", `${ligne.nom} : allumé.`, { cible: code });
  return true;
}

/** Allume un écran éteint (bouton « Allumer cet écran »). Seuls les écrans de la liste peuvent l'être ici. */
export async function allumerEcran(code: string): Promise<void> {
  await exigerSession();
  if (!ecranParCode(code)) return;
  await allumer(code);
  revalidatePath("/", "layout");
}

/** Allume d'un coup tous les écrans (ils affichent et enregistrent seulement : aucun n'envoie ni ne dépense). */
export async function allumerTousLesEcrans(): Promise<void> {
  await exigerSession();
  for (const code of CODES_ECRANS) await allumer(code);
  revalidatePath("/", "layout");
}
