"use server";

import { revalidatePath } from "next/cache";
import { interrupteurAllume, journaliser } from "@/donnees";
import { importerBases, INTERRUPTEUR_BASES } from "@/import/importer";
import { exigerSession } from "@/services/auth";

export type ResultatRecharger = { ok: true } | { ok: false; message: string };

export async function recharger(): Promise<ResultatRecharger> {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_BASES))) return { ok: false, message: "Le rechargement des bases est éteint." };
  try {
    await importerBases();
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    await journaliser("import", `Rechargement des bases interrompu, rien n'a changé : ${detail}`, { cible: "bases-erreur" }).catch(() => undefined);
    return { ok: false, message: "Le rechargement s'est interrompu ; rien n'a changé. Réessayez dans un instant." };
  }
  revalidatePath("/reglages/bases");
  return { ok: true };
}
