"use server";

import { revalidatePath } from "next/cache";
import { ErreurCalendrier, changerLeJour } from "@/calendrier";
import { exigerSession } from "@/services/auth";

export interface EtatDate {
  message: string | null;
}

/** Enregistre le nouveau jour d'un contenu du calendrier. */
export async function deplacerContenu(_: EtatDate, formulaire: FormData): Promise<EtatDate> {
  await exigerSession();
  try {
    await changerLeJour(String(formulaire.get("id") ?? ""), String(formulaire.get("jour") ?? ""));
  } catch (e) {
    if (e instanceof ErreurCalendrier) return { message: e.message };
    throw e;
  }
  revalidatePath("/calendrier");
  return { message: "Jour enregistré." };
}
