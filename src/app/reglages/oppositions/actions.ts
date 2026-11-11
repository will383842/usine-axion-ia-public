"use server";

import { refresh } from "next/cache";
import { interrupteurAllume } from "@/donnees";
import { ajouterOpposition, INTERRUPTEUR_OPPOSITION, type ResultatOpposition, type SaisieOpposition } from "@/opposition";
import { exigerSession } from "@/services/auth";

/** Ajout à la main par Will. L'adresse saisie n'est ni gardée, ni journalisée, ni renvoyée. */
export async function ajouter(entree: SaisieOpposition): Promise<ResultatOpposition> {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_OPPOSITION))) return { ok: false, message: "Cet écran est éteint." };
  try {
    const r = await ajouterOpposition(entree);
    if (r.ok) refresh();
    return r;
  } catch {
    return { ok: false, message: "L'opposition n'a pas pu être enregistrée. Réessayez." };
  }
}
