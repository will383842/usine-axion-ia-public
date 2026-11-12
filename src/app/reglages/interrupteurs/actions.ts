"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, journaliser } from "@/donnees";
import { exigerSession } from "@/services/auth";

const Demande = z.object({ code: z.string().min(1).max(100), allume: z.boolean() });

/** Allume ou éteint un interrupteur ; le changement est noté au journal. */
export async function changerInterrupteur(code: string, allume: boolean): Promise<void> {
  await exigerSession();
  const demande = Demande.parse({ code, allume });
  const ligne = await depots.interrupteur.lire(demande.code);
  if (!ligne || ligne.archive_le || ligne.allume === demande.allume) return;
  await depots.interrupteur.modifier(demande.code, { allume: demande.allume });
  await journaliser("interrupteur", `${ligne.nom} : ${demande.allume ? "allumé" : "éteint"}.`, { cible: demande.code });
  revalidatePath("/", "layout");
}
