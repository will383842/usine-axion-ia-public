"use server";

import { revalidatePath } from "next/cache";
import { envoyerCodeEssai, exigerSession, validerCodeEssai } from "@/services/auth";

export type EtatEssai = { message: string | null; etape?: "code" | "fini" };

/** Étape 1 : le mot de passe retapé, puis un code part par courriel. */
export async function envoyerEssai(_avant: EtatEssai, formulaire: FormData): Promise<EtatEssai> {
  await exigerSession();
  const r = await envoyerCodeEssai(String(formulaire.get("motDePasse") ?? ""));
  return r.ok ? { message: null, etape: "code" } : { message: r.message };
}

/** Étape 2 : le bon code allume le second code par courriel ; la session en cours reste ouverte. */
export async function validerEssai(_avant: EtatEssai, formulaire: FormData): Promise<EtatEssai> {
  await exigerSession();
  const r = await validerCodeEssai(String(formulaire.get("code") ?? ""));
  if (!r.ok) return { message: r.message, etape: "code" };
  revalidatePath("/", "layout");
  return { message: null, etape: "fini" };
}
