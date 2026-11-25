"use server";

import { revalidatePath } from "next/cache";
import { journaliser } from "@/donnees";
import { couperAutonomie } from "@/reglages/plafond-automatique";
import { exigerSession } from "@/services/auth";
import { arreter, reprendre } from "./index";

/** « Tout arrêter » : arrête tout envoi et toute commande automatique, éteint l'autonomie au Studio, n'efface rien. La reprise ne la rallume jamais. */
export async function toutArreter(): Promise<void> {
  await exigerSession();
  await arreter();
  // Éteindre l'autonomie au Studio : hors de `sousArret` (l'arrêt est déjà posé, éteindre est toujours sûr). Si le Studio se tait, l'arrêt reste posé.
  try {
    const r = await couperAutonomie();
    if (!r.ok) await journaliser("arret", "Tout arrêter : l'extinction de l'autonomie n'a pas pu être confirmée par le Studio. À éteindre aussi dans le Studio.", { cible: "autonomie.plafond", donnees: { raison: r.raison } });
  } catch {
    await journaliser("arret", "Tout arrêter : l'extinction de l'autonomie n'a pas pu être envoyée au Studio. À éteindre aussi dans le Studio.", { cible: "autonomie.plafond" }).catch(() => undefined);
  }
  revalidatePath("/", "layout");
}

/** Reprise : seulement sur un geste du fondateur, notée au journal. */
export async function reprendreTout(): Promise<void> {
  await exigerSession();
  await reprendre();
  revalidatePath("/", "layout");
}
