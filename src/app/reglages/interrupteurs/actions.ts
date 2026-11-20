"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, journaliser } from "@/donnees";
import { idSecondCodeActif } from "@/auth/session";
import { requete, transaction } from "@/lib/base";
import { exigerSession } from "@/services/auth";

const TOTP = "connexion.second-code";
const COURRIEL = "connexion.second-code-courriel";

const Demande = z.object({ code: z.string().min(1).max(100), allume: z.boolean() });

/** Résultat montré à l'écran : un refus porte une phrase en français simple, jamais une erreur levée (Next la masque en production). */
export type ResultatInterrupteur = { ok: true } | { ok: false; message: string };

const SANS_TELEPHONE = "Aucun téléphone n'est enregistré.";
const COURRIEL_PAR_ESSAI = "Le second code par courriel s'allume depuis « Second code », par un essai réussi.";
const NOMS_SECONDS_CODES: Record<string, string> = { [TOTP]: "Second code à la connexion", [COURRIEL]: "Second code par courriel" };

/**
 * Allume ou éteint un interrupteur ; le changement est noté au journal. Les refus (R1, exclusion, courriel) sont RENDUS,
 * pas levés. Vérification et écriture se font dans UNE transaction, les deux interrupteurs de second code verrouillés
 * dans le même ordre que `mettreEnService` : deux demandes simultanées ne passent pas l'une à travers l'autre.
 */
export async function changerInterrupteur(code: string, allume: boolean): Promise<ResultatInterrupteur> {
  await exigerSession();
  const demande = Demande.parse({ code, allume });
  // Le courriel ne s'allume que par l'essai réussi (écran « Second code »), jamais par ce bouton.
  if (demande.allume && demande.code === COURRIEL) return { ok: false, message: COURRIEL_PAR_ESSAI };
  const refus = await transaction<ResultatInterrupteur | null>(async () => {
    if (demande.code === TOTP || demande.code === COURRIEL) await requete("SELECT 1 FROM interrupteur WHERE code = ANY($1) ORDER BY code FOR UPDATE", [[TOTP, COURRIEL]]);
    const ligne = await depots.interrupteur.lire(demande.code);
    if (!ligne || ligne.archive_le || ligne.allume === demande.allume) return null;
    if (demande.allume && demande.code === TOTP) {
      // Réserve R1 : sans téléphone enregistré, allumer le second code par application enfermerait le fondateur dehors.
      if (!(await idSecondCodeActif())) return { ok: false, message: SANS_TELEPHONE };
      // Exclusion : un seul des deux seconds codes à la fois (une ligne archivée ne compte pas).
      const [autre] = await requete<{ allume: boolean }>("SELECT allume FROM interrupteur WHERE code = $1 AND archive_le IS NULL", [COURRIEL]);
      if (autre?.allume === true) return { ok: false, message: `Éteignez d'abord « ${NOMS_SECONDS_CODES[COURRIEL]} ».` };
    }
    await depots.interrupteur.modifier(demande.code, { allume: demande.allume });
    await journaliser("interrupteur", `${ligne.nom} : ${demande.allume ? "allumé" : "éteint"}.`, { cible: demande.code });
    return null;
  });
  if (refus) return refus;
  revalidatePath("/", "layout");
  return { ok: true };
}
