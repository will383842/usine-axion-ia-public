"use server";

import { refaire } from "@/bibliotheque";
import { exigerSession } from "@/services/auth";

/** « Refaire » : une reprise à relire dans Mes vidéos. L'origine ne bouge pas. Rejouable : une même origine n'est remise à refaire qu'une fois. */
export async function refaireAction(idLigne: string): Promise<{ fait: boolean; message: string }> {
  await exigerSession();
  return refaire(String(idLigne));
}
