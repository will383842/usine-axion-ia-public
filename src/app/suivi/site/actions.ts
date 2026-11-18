"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerSession } from "@/services/auth";
import { changerSurLeSite } from "@/suivi";

const Id = z.string().regex(/^L[0-9]+-[0-9]+$/);

/** Coche ou décoche « Sur le site » pour une vidéo. Rien n'est supprimé ; décocher note la date et une ligne au journal. */
export async function surLeSite(id: string, coche: boolean): Promise<void> {
  await exigerSession();
  const lu = Id.safeParse(id);
  if (!lu.success) return;
  await changerSurLeSite(lu.data, coche === true);
  revalidatePath("/suivi/site");
}
