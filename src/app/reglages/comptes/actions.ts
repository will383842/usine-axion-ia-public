"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, interrupteurAllume, journaliser } from "@/donnees";
import { exigerSession } from "@/services/auth";
import { INTERRUPTEUR_COMPTES } from "./interrupteur";

const Code = z.string().min(1).max(200);

/** Allume ou éteint un compte (rien d'autre ne change). Réversible : le même geste dans l'autre sens. */
export async function allumerCompte(
  code: string,
  actif: boolean,
): Promise<void> {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_COMPTES))) return;
  const compte = await depots.compte.lire(Code.parse(code));
  if (
    !compte ||
    compte.etat === "retire" ||
    compte.archive_le ||
    compte.actif === actif
  )
    return;
  await depots.compte.modifier(compte.code, { actif });
  await journaliser(
    "compte",
    `${compte.nom ?? compte.code} : ${actif ? "allumé" : "éteint"}.`,
    { cible: compte.code },
  );
  revalidatePath("/reglages/comptes");
}
