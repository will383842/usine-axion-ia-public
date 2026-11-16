"use server";

import { revalidatePath } from "next/cache";
import { interrupteurAllume } from "@/donnees";
import { PLAFOND_AUTO_MAX_CENTS, type ResultatPlafond } from "@/contrats";
import { envoyerPlafondAutomatique, lireSaisieEuros } from "@/reglages/plafond-automatique";
import { exigerSession } from "@/services/auth";

const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const BORNES = `Indiquez un montant entre 0 et ${euros.format(PLAFOND_AUTO_MAX_CENTS / 100)} €, avec au plus deux chiffres après la virgule.`;

function enClair(r: ResultatPlafond): { ok: boolean; message: string } {
  if (r.ok) return { ok: true, message: `Le Studio a accepté le plafond : ${euros.format(r.plafond_cents / 100)} € par mois. Les achats automatiques restent éteints.` };
  switch (r.raison) {
    case "hors_bornes":
      return { ok: false, message: BORNES };
    case "arret":
      return { ok: false, message: "Tout est arrêté : rien n'a été envoyé." };
    case "pas_branche":
      return { ok: false, message: "Le lien avec le Studio est éteint : rien n'a été envoyé." };
    case "sans_reponse":
      return { ok: false, message: "Le Studio ne répond pas : le plafond n'a pas changé. Réessayez plus tard." };
    case "refuse":
      return { ok: false, message: "Le Studio a refusé l'envoi : le plafond n'a pas changé. Le détail est dans le journal." };
    case "reponse_inattendue":
      return { ok: false, message: "Le Studio a répondu de façon inattendue : le plafond n'est pas noté comme accepté. Le détail est dans le journal." };
  }
}

/** Envoie le plafond saisi en euros. Les achats automatiques ne sont jamais touchés : le service envoie toujours « éteint ». */
export async function enregistrerPlafondAutomatique(saisie: string): Promise<{ ok: boolean; message: string }> {
  await exigerSession();
  if (!(await interrupteurAllume("plafond.ecran"))) return { ok: false, message: "Cet écran est éteint." };
  const centimes = lireSaisieEuros(String(saisie));
  if (centimes === null) return { ok: false, message: BORNES };
  try {
    const r = enClair(await envoyerPlafondAutomatique(centimes));
    revalidatePath("/reglages/plafond");
    return r;
  } catch {
    return { ok: false, message: "Le plafond n'a pas pu être envoyé. Réessayez plus tard." };
  }
}
