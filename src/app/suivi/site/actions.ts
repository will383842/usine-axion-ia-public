"use server";

import { revalidatePath } from "next/cache";
import { exigerSession } from "@/services/auth";
import { idLotLigne } from "@/contrats/identifiants";
import { changerSurLeSite, suiviAllume } from "@/suivi";

/** Coche ou décoche « Sur le site » pour une vidéo. Rien n'est supprimé ; décocher note la date et une ligne au journal. */
export async function surLeSite(id: string, coche: boolean): Promise<void> {
  await exigerSession();
  if (!(await suiviAllume())) return;
  const lu = idLotLigne.safeParse(id);
  if (!lu.success) return;
  await changerSurLeSite(lu.data, coche === true);
  revalidatePath("/suivi/site");
}
