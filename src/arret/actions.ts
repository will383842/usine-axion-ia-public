"use server";

import { revalidatePath } from "next/cache";
import { exigerSession } from "@/services/auth";
import { arreter, reprendre } from "./index";

/** « Tout arrêter » : arrête tout envoi et toute commande automatique, n'efface rien. */
export async function toutArreter(): Promise<void> {
  await exigerSession();
  await arreter();
  revalidatePath("/", "layout");
}

/** Reprise : seulement sur un geste de Will, notée au journal. */
export async function reprendreTout(): Promise<void> {
  await exigerSession();
  await reprendre();
  revalidatePath("/", "layout");
}
