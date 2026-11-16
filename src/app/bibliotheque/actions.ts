"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { refaire } from "@/bibliotheque";
import { exigerSession } from "@/services/auth";

/** « Refaire » : une nouvelle ligne à relire dans le lot de reprises. L'origine ne bouge pas. */
export async function refaireAction(idLigne: string): Promise<void> {
  await exigerSession();
  const r = await refaire(String(idLigne));
  revalidatePath("/bibliotheque");
  redirect(`/bibliotheque?${r.fait ? "fait" : "erreur"}=${encodeURIComponent(r.message)}`);
}
