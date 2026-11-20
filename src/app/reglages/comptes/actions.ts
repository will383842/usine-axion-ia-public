"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, interrupteurAllume, journaliser } from "@/donnees";
import { exigerSession } from "@/services/auth";
import { PUBLIEUR_DEPART } from "@/import/depart";
import { INTERRUPTEUR_COMPTES } from "./interrupteur";
import { lireSaisieCompte, type SaisieCompte } from "./saisie";

const Code = z.string().min(1).max(200);

/** Allume ou éteint un compte (rien d'autre ne change). Réversible : le même geste dans l'autre sens. */
export async function allumerCompte(
  code: string,
  actif: boolean,
): Promise<void> {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_COMPTES))) return;
  const compte = await depots.compte.lire(Code.parse(code));
  if (
    !compte ||
    compte.etat === "retire" ||
    compte.archive_le ||
    compte.actif === actif
  )
    return;
  await depots.compte.modifier(compte.code, { actif });
  await journaliser(
    "compte",
    `${compte.nom ?? compte.code} : ${actif ? "allumé" : "éteint"}.`,
    { cible: compte.code },
  );
  revalidatePath("/reglages/comptes");
}

/** Ajoute un compte (éteint, à valider, libellé neutre du diffuseur) ; le geste est noté au journal. Un compte existant n'est jamais réécrit. */
export async function ajouterCompte(saisie: SaisieCompte): Promise<{ ok: boolean; message?: string }> {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_COMPTES))) return { ok: false, message: "Cet écran est éteint." };
  const r = lireSaisieCompte(saisie);
  if (!r.ok) return r;
  const c = r.valeur;
  if (await depots.compte.lire(c.code)) return { ok: false, message: "Ce compte existe déjà dans la liste." };
  await depots.compte.ecrire({ ...c, publieur: PUBLIEUR_DEPART, actif: false, etat: "propose", origine: "saisi" });
  await journaliser("compte", `${c.nom} (${c.code}) : ajouté, éteint.`, { cible: c.code });
  revalidatePath("/reglages/comptes");
  return { ok: true, message: "Compte ajouté, éteint : rendez-le actif pour qu'il reçoive des propositions." };
}
