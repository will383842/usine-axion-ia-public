"use server";

import { revalidatePath } from "next/cache";
import { lundiVise, proposerLaSemaine } from "@/planification";
import { exigerSession } from "@/services/auth";

export interface EtatSemaine {
  message: string | null;
}

/** Propose la semaine au Studio : geste explicite du fondateur, jamais automatique. */
export async function proposerLaSemaineAction(): Promise<EtatSemaine> {
  await exigerSession();
  const r = await proposerLaSemaine(await lundiVise());
  revalidatePath("/semaine");
  return { message: r.message };
}
