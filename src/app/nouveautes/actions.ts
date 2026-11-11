"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ErreurNouveaute, ecarterNouveaute, garderNouveaute } from "@/nouveautes";
import { exigerSession } from "@/services/auth";

const Code = z.string().regex(/^actu\.[0-9a-z.-]+$/);

export interface EtatGarder {
  message: string | null;
}

/** « Garder » : la nouveauté entre au tirage suivant. */
export async function garder(_: EtatGarder, formulaire: FormData): Promise<EtatGarder> {
  await exigerSession();
  const code = Code.safeParse(formulaire.get("code"));
  if (!code.success) return { message: "Nouveauté introuvable." };
  try {
    await garderNouveaute(code.data);
  } catch (e) {
    if (e instanceof ErreurNouveaute) return { message: e.message };
    throw e;
  }
  revalidatePath("/nouveautes");
  revalidatePath("/sujets");
  revalidatePath("/");
  return { message: null };
}

/** « Écarter » (avec « Annuler » 10 s) : la nouveauté n'est plus proposée. */
export async function ecarter(code: string): Promise<void> {
  await exigerSession();
  try {
    await ecarterNouveaute(Code.parse(code));
  } catch (e) {
    if (!(e instanceof ErreurNouveaute)) throw e;
  }
  revalidatePath("/nouveautes");
  revalidatePath("/sujets");
  revalidatePath("/");
}
