"use server";

import { revalidatePath } from "next/cache";
import { interrupteurAllume } from "@/donnees";
import { PLAFOND_AUTO_MAX_CENTS, type ResultatPlafond } from "@/contrats";
import { couperAutonomie, envoyerAutonomie, envoyerPlafondAutomatique, lireSaisieEuros } from "@/reglages/plafond-automatique";
import { exigerSession } from "@/services/auth";

const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const montant = (centimes: number) => `${euros.format(centimes / 100)} €`;
const BORNES = `Indiquez un montant entre 0 et ${montant(PLAFOND_AUTO_MAX_CENTS)}, avec au plus deux chiffres après la virgule.`;
const BORNES_ALLUMER = `Pour allumer, indiquez un montant supérieur à 0 et au plus ${montant(PLAFOND_AUTO_MAX_CENTS)}, avec au plus deux chiffres après la virgule.`;
const PAS_DE_REPONSE = "Le Studio ne répond pas : rien n'a changé. Réessayez plus tard.";

type Message = { ok: boolean; message: string };

function enClair(r: ResultatPlafond, reussite: string): Message {
  if (r.ok) return { ok: true, message: reussite };
  switch (r.raison) {
    case "hors_bornes":
      return { ok: false, message: BORNES };
    case "arret":
      return { ok: false, message: "Tout est arrêté : rien n'a été envoyé." };
    case "pas_branche":
      return { ok: false, message: "Le lien avec le Studio est éteint : rien n'a été envoyé." };
    case "sans_reponse":
      return { ok: false, message: PAS_DE_REPONSE };
    case "refuse":
      return { ok: false, message: "Le Studio a refusé l'envoi : rien n'a changé. Le détail est dans le journal." };
    case "reponse_inattendue":
      return { ok: false, message: "Le Studio a répondu de façon inattendue : ce réglage n'est pas noté comme accepté. Le détail est dans le journal." };
    case "arret_en_vol":
      return { ok: false, message: "Tout a été arrêté pendant l'envoi : l'autonomie a été éteinte aussitôt, rien ne se dépense seul." };
  }
}

/** Un allumage sans réponse nette a pu être appliqué : on ne dit jamais « rien n'a changé ». */
const PEUT_ETRE_ALLUMEE = "Le Studio n'a pas confirmé : l'autonomie est PEUT-ÊTRE allumée. Rechargez la page pour lire l'état, ou éteignez-la.";

function enClairAllumage(r: ResultatPlafond, reussite: string): Message {
  if (!r.ok && (r.raison === "sans_reponse" || r.raison === "reponse_inattendue" || (r.raison === "refuse" && (r.statut ?? 0) >= 500))) return { ok: false, message: PEUT_ETRE_ALLUMEE };
  return enClair(r, reussite);
}

async function ecranAllume(): Promise<boolean> {
  return interrupteurAllume("plafond.ecran");
}

/**
 * Règle seulement le plafond du mois, autonomie éteinte (rien ne s'allume ici).
 * Au premier réglage accepté, le Studio passe la main à l'Usine : l'interrupteur de Studio > Réglages « L'Usine en automatique » ne se règle plus là-bas (sauf « Éteindre »).
 */
export async function enregistrerPlafondAutomatique(saisie: string): Promise<Message> {
  await exigerSession();
  if (!(await ecranAllume())) return { ok: false, message: "Cet écran est éteint." };
  const centimes = lireSaisieEuros(String(saisie));
  if (centimes === null) return { ok: false, message: BORNES };
  try {
    const r = enClair(await envoyerPlafondAutomatique(centimes), `Le Studio a accepté le plafond : ${montant(centimes)} par mois. L'Usine ne dépense toujours rien seule.`);
    revalidatePath("/reglages/plafond");
    return r;
  } catch {
    return { ok: false, message: PAS_DE_REPONSE };
  }
}

/**
 * Allume ce que l'Usine dépense seule, avec le plafond saisi (de un centime à la borne haute).
 * C'est la SEULE action qui peut envoyer l'état « allumé ». Elle exige la confirmation « allumer » (donnée par le bouton « Oui, allumer » du panneau de résumé).
 * Ordre écrit du fondateur du 25/11 : « oui sur l'autonomie de l'usine » ; « ok pour 20€ MAIS il faudrait que je puisse changer le montant directement dans la console de l'usine par l'UI ».
 */
export async function allumerAutonomie(saisie: string, confirmation: string): Promise<Message> {
  await exigerSession();
  if (confirmation !== "allumer") return { ok: false, message: "Confirmation manquante : rien n'a été allumé." };
  if (!(await ecranAllume())) return { ok: false, message: "Cet écran est éteint." };
  const centimes = lireSaisieEuros(String(saisie));
  if (centimes === null || centimes === 0) return { ok: false, message: BORNES_ALLUMER };
  try {
    const r = enClairAllumage(await envoyerAutonomie({ actif: true, plafondCents: centimes }), `Autonomie allumée : l'Usine peut dépenser seule jusqu'à ${montant(centimes)} par mois.`);
    revalidatePath("/reglages/plafond");
    return r;
  } catch {
    return { ok: false, message: PEUT_ETRE_ALLUMEE };
  }
}

/** Éteint ce que l'Usine dépense seule, tout de suite : sans confirmation ni délai (c'est le sens sûr). Ne dépend que de la session, pas de l'interrupteur de l'écran. */
export async function eteindreAutonomie(): Promise<Message> {
  await exigerSession();
  try {
    const r = await couperAutonomie();
    revalidatePath("/reglages/plafond");
    if (r.ok) return { ok: true, message: "Autonomie éteinte : l'Usine ne dépense plus rien seule." };
    if (r.raison === "sans_reponse") return { ok: false, message: "Le Studio ne répond pas : l'extinction n'est pas confirmée. L'autonomie peut encore être allumée ; éteignez-la aussi dans le Studio." };
    return enClair(r, "");
  } catch {
    return { ok: false, message: PAS_DE_REPONSE };
  }
}
