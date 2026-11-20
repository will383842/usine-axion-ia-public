"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, interrupteurAllume, journaliser } from "@/donnees";
import { exigerSession } from "@/services/auth";
import { PUBLIEUR_DEPART } from "@/import/depart";
import { requete } from "@/lib/base";
import { PHRASE_RESEAU_ECARTE, estReseauEcarte } from "@/planification/reseaux-ecartes";
import { INTERRUPTEUR_COMPTES } from "./interrupteur";
import { lireSaisieCompte, type SaisieCompte } from "./saisie";

const Code = z.string().min(1).max(200);
const Saisie = z.object({ reseau: z.string(), identifiant: z.string(), nom: z.string(), nature: z.string() }).strict();

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

/** Ajoute un compte (éteint, à valider, libellé neutre du diffuseur) ; le geste est noté au journal. INSERT strict : un compte existant n'est jamais réécrit. */
export async function ajouterCompte(saisie: SaisieCompte): Promise<{ ok: boolean; message?: string }> {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_COMPTES))) return { ok: false, message: "Cet écran est éteint." };
  const t = Saisie.safeParse(saisie);
  if (!t.success) return { ok: false, message: "La saisie est incomplète : remplissez les quatre champs." };
  const r = lireSaisieCompte(t.data);
  if (!r.ok) return { ok: false, message: r.message };
  const c = r.valeur;
  const ajoute = await requete<{ code: string }>(
    "INSERT INTO compte (code, reseau, identifiant, nature, nom, publieur, actif, etat, origine) VALUES ($1, $2, $3, $4, $5, $6, false, 'propose', 'saisi') ON CONFLICT (code) DO NOTHING RETURNING code",
    [c.code, c.reseau, c.identifiant, c.nature, c.nom, PUBLIEUR_DEPART],
  );
  if (!ajoute.length) return { ok: false, message: "Ce compte existe déjà." };
  await journaliser("compte", `${c.nom} (${c.code}) : ajouté, éteint.`, { cible: c.code });
  revalidatePath("/reglages/comptes");
  return {
    ok: true,
    message: estReseauEcarte(c.reseau) ? `Compte ajouté, éteint. ${PHRASE_RESEAU_ECARTE}` : "Compte ajouté, éteint : rendez-le actif pour qu'il reçoive des propositions.",
  };
}
