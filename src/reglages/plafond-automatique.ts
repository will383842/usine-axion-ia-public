/** PLAFOND-USINE-a · envoi du plafond des achats automatiques au Studio, et dernier plafond accepté. Rien ici n'allume l'autonomie. */
import "server-only";
import { z } from "zod";
import { sousArret } from "@/arret";
import { ecrireReglage, journaliser, lireReglage } from "@/donnees";
import { PLAFOND_AUTO_MAX_CENTS, reponsePlafondStudio, type RaisonPlafond, type ResultatPlafond } from "@/contrats";
import { reglerPlafondDuStudio } from "@/passerelles/studio";

export const CLE_PLAFOND_AUTO = "autonomie.plafond";

const MOTIF_EUROS = /^\d{1,3}([.,]\d{1,2})?$/;

/** Saisie en euros → centimes entiers, par la chaîne (jamais par un flottant). Espaces de début et de fin (insécables compris) acceptés, espaces internes refusés (« 1 0 » n'est pas 10 €). `null` si illisible ou hors de 0..borne. */
export function lireSaisieEuros(texte: string): number | null {
  const net = texte.replace(/^[\s\u00a0\u202f]+|[\s\u00a0\u202f]+$/g, "");
  if (!MOTIF_EUROS.test(net)) return null;
  const [euros, decimales = ""] = net.split(/[.,]/);
  const centimes = Number(euros) * 100 + Number(decimales.padEnd(2, "0"));
  return centimes <= PLAFOND_AUTO_MAX_CENTS ? centimes : null;
}

const reglageLu = z.object({ plafond_cents: z.number().int().min(0).max(PLAFOND_AUTO_MAX_CENTS), accepte_le: z.string(), version: z.literal(1) });

/** Dernier plafond accepté par le Studio, ou `null` (jamais envoyé, ou réglage illisible). */
export async function lirePlafondAutomatique(): Promise<{ plafond_cents: number; accepte_le: string } | null> {
  try {
    const r = reglageLu.safeParse(await lireReglage<unknown>(CLE_PLAFOND_AUTO, null));
    return r.success ? { plafond_cents: r.data.plafond_cents, accepte_le: r.data.accepte_le } : null;
  } catch {
    return null;
  }
}

const EN_CLAIR: Record<RaisonPlafond, string> = {
  hors_bornes: "montant hors des bornes",
  arret: "tout est arrêté",
  pas_branche: "le lien avec le Studio est éteint",
  sans_reponse: "le Studio ne répond pas",
  refuse: "le Studio a refusé l'envoi",
  reponse_inattendue: "réponse inattendue du Studio",
};

async function echec(plafond_cents: number, raison: RaisonPlafond, statut?: number): Promise<ResultatPlafond> {
  await journaliser("reglage", `Plafond des achats automatiques non envoyé : ${EN_CLAIR[raison]}.`, {
    cible: CLE_PLAFOND_AUTO,
    donnees: statut === undefined ? { plafond_cents, raison } : { plafond_cents, raison, statut },
  });
  return statut === undefined ? { ok: false, raison } : { ok: false, raison, statut };
}

/** Envoie le plafond (centimes entiers). Le réglage local n'est écrit que sur une réponse 200 conforme au montant envoyé. */
export async function envoyerPlafondAutomatique(plafondCents: number): Promise<ResultatPlafond> {
  if (!Number.isSafeInteger(plafondCents) || plafondCents < 0 || plafondCents > PLAFOND_AUTO_MAX_CENTS) return { ok: false, raison: "hors_bornes" };
  let r;
  try {
    r = await sousArret("commande", () => reglerPlafondDuStudio(plafondCents));
  } catch {
    return echec(plafondCents, "sans_reponse");
  }
  if (!r.fait) return echec(plafondCents, "arret");
  if (!r.valeur.envoye) return echec(plafondCents, "pas_branche");
  const { statut, corps } = r.valeur;
  if (statut !== 200) return echec(plafondCents, "refuse", statut);
  const lue = reponsePlafondStudio.safeParse(corps);
  if (!lue.success || lue.data.plafond_automatique_cents !== plafondCents) {
    if (typeof corps === "object" && corps !== null && (corps as { automatique?: unknown }).automatique === true) {
      await journaliser("reglage", "Alerte : le Studio indique des achats automatiques allumés.", { cible: CLE_PLAFOND_AUTO, donnees: { plafond_cents: plafondCents } });
    }
    return echec(plafondCents, "reponse_inattendue", statut);
  }
  await journaliser("reglage", "Plafond des achats automatiques accepté par le Studio. Les achats automatiques restent éteints.", {
    cible: CLE_PLAFOND_AUTO,
    donnees: { plafond_cents: plafondCents, deja: lue.data.deja },
  });
  const avant = await lirePlafondAutomatique();
  if (!(lue.data.deja && avant?.plafond_cents === plafondCents)) {
    await ecrireReglage(CLE_PLAFOND_AUTO, { plafond_cents: plafondCents, accepte_le: new Date().toISOString(), version: 1 });
  }
  return { ok: true, plafond_cents: plafondCents, deja: lue.data.deja };
}
