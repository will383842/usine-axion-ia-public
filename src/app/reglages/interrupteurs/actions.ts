"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, journaliser } from "@/donnees";
import { arreter, CODE_ARRET, reprendre } from "@/arret";
import { exigerSession } from "@/services/auth";

const Demande = z.object({ code: z.string().min(1).max(100), allume: z.boolean() });

/** Allume ou éteint un interrupteur ; le changement est noté au journal. */
export async function changerInterrupteur(code: string, allume: boolean): Promise<void> {
  await exigerSession();
  const demande = Demande.parse({ code, allume });
  if (demande.code === CODE_ARRET) return; // « Tout arrêter » a ses propres gestes : toutArreter, reprendreTout.
  const ligne = await depots.interrupteur.lire(demande.code);
  if (!ligne || ligne.archive_le || ligne.allume === demande.allume) return;
  await depots.interrupteur.modifier(demande.code, { allume: demande.allume });
  await journaliser("interrupteur", `${ligne.nom} : ${demande.allume ? "allumé" : "éteint"}.`, { cible: demande.code });
  revalidatePath("/", "layout");
}

/** « Tout arrêter » : arrête tout envoi et toute commande automatique, n'efface rien. */
export async function toutArreter(): Promise<void> {
  await exigerSession();
  await arreter();
  revalidatePath("/", "layout");
}

/** Reprise : seulement sur un geste de Will, notée au journal. */
export async function reprendreTout(): Promise<void> {
  await exigerSession();
  await reprendre();
  revalidatePath("/", "layout");
}
