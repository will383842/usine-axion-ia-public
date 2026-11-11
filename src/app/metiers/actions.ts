"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, interrupteurAllume, journaliser } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { exigerSession } from "@/services/auth";
import { INTERRUPTEUR_METIERS } from "./calculs";

const Code = z.string().min(1).max(200);

async function pret() {
  await exigerSession();
  return interrupteurAllume(INTERRUPTEUR_METIERS);
}

/** Allume ou éteint un métier (rien d'autre ne change). */
export async function allumerMetier(code: string, allume: boolean): Promise<void> {
  await exigerSession();
  if (!(await pret())) return;
  const metier = await depots.metier.lire(Code.parse(code));
  if (!metier || metier.etat === "retire" || metier.allume === allume) return;
  await depots.metier.modifier(metier.code, { allume });
  await journaliser("metier", `${metier.nom ?? metier.code} : ${allume ? "allumé" : "éteint"}.`, { cible: metier.code });
  revalidatePath("/metiers", "layout");
  revalidatePath("/sujets");
}

/** Allume ou éteint tous les métiers d'un secteur. */
export async function allumerSecteur(secteur: string, allume: boolean): Promise<void> {
  await exigerSession();
  if (!(await pret())) return;
  const code = Code.parse(secteur);
  const touches = await requete<{ code: string }>(
    `UPDATE metier SET allume = $1, modifie_le = now() WHERE secteur = $2 AND etat <> 'retire' AND allume <> $1 RETURNING code`,
    [allume, code],
  );
  if (!touches.length) return;
  const nom = (await depots.secteur.lire(code))?.nom ?? code;
  await journaliser("metier", `Secteur ${nom} : ${touches.length} métier${touches.length > 1 ? "s" : ""} ${allume ? "allumés" : "éteints"}.`, { cible: code });
  revalidatePath("/metiers", "layout");
  revalidatePath("/sujets");
}

/** Valide un métier en bloc : sa fiche, ses douleurs et ses cas d'usage (ce qui est encore à valider). */
export async function validerMetier(code: string): Promise<void> {
  await exigerSession();
  if (!(await pret())) return;
  const metier = await depots.metier.lire(Code.parse(code));
  if (!metier || metier.etat === "retire") return;
  const jour = new Date().toISOString().slice(0, 10);
  const nombres = await transaction(async () => {
    const maj = (table: string, colonne: string) =>
      requete(
        `UPDATE ${table} SET etat = 'valide', valide_le = $2, modifie_le = now() WHERE ${colonne} = $1 AND etat IN ('brouillon', 'propose') RETURNING code`,
        [metier.code, jour],
      );
    const [m, d, c] = [await maj("metier", "code"), await maj("douleur", "cible"), await maj("cas_usage", "cible")];
    return { fiche: m.length, douleurs: d.length, cas: c.length };
  });
  await journaliser("metier", `${metier.nom ?? metier.code} validé (${nombres.douleurs} douleurs, ${nombres.cas} cas).`, { cible: metier.code, donnees: nombres });
  revalidatePath("/metiers", "layout");
  revalidatePath("/sujets");
}
