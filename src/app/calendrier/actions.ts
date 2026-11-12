"use server";

import { revalidatePath } from "next/cache";
import { ErreurCalendrier, changerLeJour, placerLesNouveaux } from "@/calendrier";
import { LIBELLE_RESEAU } from "@/reglages/modele";
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

/** Place dans le calendrier les contenus commandés qui n'y sont pas encore (action explicite, jamais au simple affichage). */
export async function placerLesNouveauxContenus(): Promise<EtatDate> {
  await exigerSession();
  const { ajoutees, auRepos } = await placerLesNouveaux();
  revalidatePath("/calendrier");
  const repos = auRepos.length > 0 ? ` Rythme à zéro pour ${auRepos.map((r) => LIBELLE_RESEAU[r]).join(", ")} : ces contenus n'ont pas de date (Réglages › Rythmes).` : "";
  if (ajoutees === 0) return { message: `Rien de nouveau à placer.${repos}` };
  return { message: `${ajoutees} ${ajoutees === 1 ? "contenu placé" : "contenus placés"}.${repos}` };
}
