"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, journaliser } from "@/donnees";
import { idSecondCodeActif } from "@/auth/session";
import { exigerSession } from "@/services/auth";

const TOTP = "connexion.second-code";
const COURRIEL = "connexion.second-code-courriel";

const Demande = z.object({ code: z.string().min(1).max(100), allume: z.boolean() });

/** Allume ou éteint un interrupteur ; le changement est noté au journal. */
export async function changerInterrupteur(code: string, allume: boolean): Promise<void> {
  await exigerSession();
  const demande = Demande.parse({ code, allume });
  // Le courriel ne s'allume que par l'essai réussi (écran « Second code »), jamais par ce bouton.
  if (demande.allume && demande.code === COURRIEL) throw new Error("Le second code par courriel s'allume depuis « Second code », par un essai réussi.");
  const ligne = await depots.interrupteur.lire(demande.code);
  if (!ligne || ligne.archive_le || ligne.allume === demande.allume) return;
  if (demande.allume) {
    // Réserve R1 : sans téléphone enregistré, allumer le second code par application enfermerait le fondateur dehors.
    if (demande.code === TOTP && !(await idSecondCodeActif())) throw new Error("Aucun téléphone n'est enregistré.");
    // Exclusion : un seul des deux seconds codes à la fois.
    const autre = demande.code === TOTP ? COURRIEL : demande.code === COURRIEL ? TOTP : null;
    if (autre && (await depots.interrupteur.lire(autre))?.allume === true)
      throw new Error(`Éteignez d'abord « ${autre === TOTP ? "Second code à la connexion" : "Second code par courriel"} ».`);
  }
  await depots.interrupteur.modifier(demande.code, { allume: demande.allume });
  await journaliser("interrupteur", `${ligne.nom} : ${demande.allume ? "allumé" : "éteint"}.`, { cible: demande.code });
  revalidatePath("/", "layout");
}
