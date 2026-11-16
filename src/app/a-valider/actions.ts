"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { envoyerValidation } from "@/commandes/validation";
import { refusCode } from "@/contrats";
import { exigerSession } from "@/services/auth";

export interface EtatGeste {
  message: string;
}

const cle = z.string().regex(/^[0-9a-f]{64}$/);
const empreinte = z.string().regex(/^[0-9a-f]{64}$/);
const INVALIDE: EtatGeste = { message: "Ce geste n'est pas complet : relisez le contenu, puis réessayez." };

/** « Valider » : un geste du fondateur, un seul appel au Studio. */
export async function validerAction(cleCommande: string, empreinteLue: string): Promise<EtatGeste> {
  await exigerSession();
  const lu = z.object({ c: cle, e: empreinte }).safeParse({ c: cleCommande, e: empreinteLue });
  if (!lu.success) return INVALIDE;
  const { message } = await envoyerValidation(lu.data.c, { decision: "valide", empreinte: lu.data.e });
  revalidatePath("/a-valider");
  return { message };
}

/** « Refuser » : un motif de la liste, une note facultative de 300 signes au plus. */
export async function refuserAction(cleCommande: string, empreinteLue: string, motif: string, note: string): Promise<EtatGeste> {
  await exigerSession();
  const lu = z.object({ c: cle, e: empreinte, m: refusCode, n: z.string().max(300) }).safeParse({ c: cleCommande, e: empreinteLue, m: motif, n: note });
  if (!lu.success) return INVALIDE;
  const { message } = await envoyerValidation(lu.data.c, { decision: "refuse", empreinte: lu.data.e, refus_code: lu.data.m, note: lu.data.n });
  revalidatePath("/a-valider");
  return { message };
}
