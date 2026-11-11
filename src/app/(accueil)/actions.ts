"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, journaliser } from "@/donnees";
import { exigerSession } from "@/services/auth";

const Identifiant = z.string().regex(/^\d+$/);

/** « C'est fait » : la carte est rangée (fait_le), jamais supprimée. */
export async function carteFaite(id: string): Promise<void> {
  await exigerSession();
  const cle = Identifiant.parse(id);
  const carte = await depots.carte.lire(cle);
  if (!carte || carte.fait_le) return;
  await depots.carte.modifier(cle, { fait_le: new Date() });
  await journaliser("ma-journee", `Carte faite : ${carte.titre}`, { cible: `carte:${cle}` });
  revalidatePath("/");
}
