"use server";

import { revalidatePath } from "next/cache";
import { ErreurChiffres, enregistrerObjectif, enregistrerReleve } from "@/chiffres";
import { exigerSession } from "@/services/auth";

export interface EtatSaisie {
  message: string | null;
  ok: boolean;
}

async function jouer(faire: () => Promise<unknown>, succes: string): Promise<EtatSaisie> {
  await exigerSession();
  try {
    await faire();
  } catch (e) {
    if (e instanceof ErreurChiffres) return { message: e.message, ok: false };
    throw e;
  }
  revalidatePath("/mots");
  revalidatePath("/");
  return { message: succes, ok: true };
}

export async function releverMot(_: EtatSaisie, f: FormData): Promise<EtatSaisie> {
  await exigerSession();
  return jouer(
    () =>
      enregistrerReleve({
        semaine: f.get("semaine"),
        mot: f.get("mot"),
        compte: f.get("compte"),
        commentaires: f.get("commentaires") ?? "",
        messages: f.get("messages") ?? "",
        demandesGuide: f.get("demandesGuide") ?? "",
        abonnesGagnes: f.get("abonnesGagnes") ?? "",
      }),
    "Chiffres enregistrés.",
  );
}

export async function fixerObjectif(_: EtatSaisie, f: FormData): Promise<EtatSaisie> {
  await exigerSession();
  return jouer(() => enregistrerObjectif({ compte: f.get("compte"), objectif: f.get("objectif") ?? "" }), "Objectif enregistré.");
}
