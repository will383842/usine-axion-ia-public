/** PLAFOND-USINE-a · envoi de l'état de l'autonomie et de son plafond au Studio, dernier réglage accepté, lecture de l'état du Studio. Allumer n'est décidé que par l'appelant (action d'allumage, après confirmation). */
import "server-only";
import { z } from "zod";
import { estArrete, sousArret } from "@/arret";
import { ecrireReglage, journaliser, lireReglage } from "@/donnees";
import { PLAFOND_AUTO_MAX_CENTS, reponseAutonomieStudio, reponsePlafondStudio, type RaisonPlafond, type ResultatPlafond } from "@/contrats";
import { lireAutonomieDuStudio, reglerPlafondDuStudio } from "@/passerelles/studio";

export const CLE_PLAFOND_AUTO = "autonomie.plafond";

/** Plafond proposé tant que le Studio n'en indique pas (décision du fondateur du 25/11 : 20 € par mois). */
export const PLAFOND_DEPART_CENTS = 2000;

const MOTIF_EUROS = /^\d{1,3}([.,]\d{1,2})?$/;

/** Saisie en euros → centimes entiers, par la chaîne (jamais par un flottant). Espaces de début et de fin (insécables compris) acceptés, espaces internes refusés (« 1 0 » n'est pas 10 €). `null` si illisible ou hors de 0..borne. */
export function lireSaisieEuros(texte: string): number | null {
  const net = texte.replace(/^[\s\u00a0\u202f]+|[\s\u00a0\u202f]+$/g, "");
  if (!MOTIF_EUROS.test(net)) return null;
  const [euros, decimales = ""] = net.split(/[.,]/);
  const centimes = Number(euros) * 100 + Number(decimales.padEnd(2, "0"));
  return centimes <= PLAFOND_AUTO_MAX_CENTS ? centimes : null;
}

const reglageLu = z.union([
  z.object({ actif: z.boolean(), plafond_cents: z.number().int().min(0).max(PLAFOND_AUTO_MAX_CENTS), accepte_le: z.string(), version: z.literal(2) }),
  z.object({ plafond_cents: z.number().int().min(0).max(PLAFOND_AUTO_MAX_CENTS), accepte_le: z.string(), version: z.literal(1) }),
]);

export type ReglageAutonomie = { actif: boolean; plafond_cents: number; accepte_le: string };

/** Dernier réglage accepté par le Studio (la version 1 se lit comme éteinte), ou `null` (jamais envoyé, ou réglage illisible). */
export async function lirePlafondAutomatique(): Promise<ReglageAutonomie | null> {
  try {
    const r = reglageLu.safeParse(await lireReglage<unknown>(CLE_PLAFOND_AUTO, null));
    if (!r.success) return null;
    return { actif: r.data.version === 2 ? r.data.actif : false, plafond_cents: r.data.plafond_cents, accepte_le: r.data.accepte_le };
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
  arret_en_vol: "tout a été arrêté pendant l'envoi, l'autonomie a été éteinte aussitôt",
};

const etat = (actif: boolean) => (actif ? "allumée" : "éteinte");
const sansAccepte = (r: ReglageAutonomie | null) => (r ? { actif: r.actif, plafond_cents: r.plafond_cents } : null);

/** Un allumage sans réponse nette (délai, 5xx, réponse inattendue) a pu être appliqué plus tard par le Studio : si « Tout arrêter » est posé, on coupe. */
const peutEtreAppliquee = (raison: RaisonPlafond, statut?: number) => raison === "sans_reponse" || raison === "reponse_inattendue" || (raison === "refuse" && (statut ?? 0) >= 500);

async function echec(demande: { actif: boolean; plafond_cents: number }, raison: RaisonPlafond, statut?: number): Promise<ResultatPlafond> {
  const echoue = await echecNote(demande, raison, statut);
  if (demande.actif && peutEtreAppliquee(raison, statut) && (await estArrete())) {
    const coupe = await couperSousArret(demande);
    if (coupe.ok) return { ok: false, raison: "arret_en_vol" };
  }
  return echoue;
}

async function echecNote(demande: { actif: boolean; plafond_cents: number }, raison: RaisonPlafond, statut?: number): Promise<ResultatPlafond> {
  const avant_usine = sansAccepte(await lirePlafondAutomatique());
  await journaliser("reglage", `Autonomie non envoyée au Studio : ${EN_CLAIR[raison]}. Avant (dernier réglage noté par l'Usine, pas lu au Studio) en données.`, {
    cible: CLE_PLAFOND_AUTO,
    donnees: statut === undefined ? { avant_usine, demande, raison } : { avant_usine, demande, raison, statut },
  });
  return statut === undefined ? { ok: false, raison } : { ok: false, raison, statut };
}

/**
 * Envoie l'état de l'autonomie et le plafond (centimes entiers) au Studio. Allumer avec 0 est refusé sans appel.
 * Le réglage local n'est écrit que sur une réponse 200 dont l'état ET le plafond sont exactement ceux envoyés ; sinon alerte au journal.
 * `extinction: true` (éteindre seulement) passe même sous « Tout arrêter » : éteindre est toujours le sens sûr.
 */
export async function envoyerAutonomie(
  { actif, plafondCents }: { actif: boolean; plafondCents: number },
  options: { extinction?: boolean } = {},
): Promise<ResultatPlafond> {
  if (!Number.isSafeInteger(plafondCents) || plafondCents < 0 || plafondCents > PLAFOND_AUTO_MAX_CENTS || (actif && plafondCents === 0)) return { ok: false, raison: "hors_bornes" };
  const demande = { actif, plafond_cents: plafondCents };
  let r;
  try {
    const envoi = () => reglerPlafondDuStudio(actif, plafondCents);
    r = options.extinction && !actif ? { fait: true as const, valeur: await envoi() } : await sousArret("commande", envoi);
  } catch {
    return echec(demande, "sans_reponse");
  }
  if (!r.fait) return echec(demande, "arret");
  if (!r.valeur.envoye) return echec(demande, "pas_branche");
  const { statut, corps } = r.valeur;
  if (statut !== 200) return echec(demande, "refuse", statut);
  const lue = reponsePlafondStudio.safeParse(corps);
  if (!lue.success || lue.data.plafond_automatique_cents !== plafondCents || lue.data.automatique !== actif) {
    const recu = typeof corps === "object" && corps !== null ? (corps as { automatique?: unknown }).automatique : undefined;
    if (!actif && recu === true) {
      await journaliser("reglage", "Alerte : le Studio indique des achats automatiques allumés.", { cible: CLE_PLAFOND_AUTO, donnees: { demande } });
    } else if (typeof recu === "boolean" && recu !== actif) {
      await journaliser("reglage", "Alerte : l'état renvoyé par le Studio diffère de l'envoi.", { cible: CLE_PLAFOND_AUTO, donnees: { demande } });
    }
    return echec(demande, "reponse_inattendue", statut);
  }
  // Le Studio a répondu 200 : à partir d'ici rien ne lève (l'état du Studio est déjà changé), un échec local n'est qu'une alerte au journal.
  try {
    const avant = await lirePlafondAutomatique();
    await journaliser("reglage", `Autonomie acceptée par le Studio : ${etat(actif)}, plafond ${plafondCents / 100} € par mois. Avant = dernier réglage noté par l'Usine, pas l'état lu au Studio.`, {
      cible: CLE_PLAFOND_AUTO,
      donnees: { avant_usine: sansAccepte(avant), apres: demande, deja: lue.data.deja },
    });
    if (!(lue.data.deja && avant?.plafond_cents === plafondCents && avant.actif === actif)) {
      await ecrireReglage(CLE_PLAFOND_AUTO, { actif, plafond_cents: plafondCents, accepte_le: new Date().toISOString(), version: 2 });
    }
  } catch {
    try {
      await journaliser("reglage", "Alerte : le Studio a accepté le réglage mais l'Usine n'a pas pu le noter.", { cible: CLE_PLAFOND_AUTO, donnees: { demande } });
    } catch {
      /* rien de plus à faire : le Studio a bien le réglage et l'écran relit son état */
    }
  }
  // Course avec « Tout arrêter » : un allumage parti avant l'arrêt peut arriver après l'extinction. On revérifie et on coupe.
  if (actif && (await estArrete())) {
    const coupe = await couperSousArret(demande);
    return coupe.ok ? { ok: false, raison: "arret_en_vol" } : { ok: false, raison: "sans_reponse" };
  }
  return { ok: true, actif, plafond_cents: plafondCents, deja: lue.data.deja };
}

/** Coupe l'autonomie parce que « Tout arrêter » est posé pendant un allumage, et le note au journal (sans jamais lever). */
async function couperSousArret(demande: { actif: boolean; plafond_cents: number }): Promise<ResultatPlafond> {
  const coupe = await couperAutonomie();
  try {
    await journaliser("reglage", coupe.ok ? "Alerte : tout a été arrêté pendant l'allumage ; l'autonomie a été éteinte aussitôt." : "Alerte : tout a été arrêté pendant l'allumage ; l'extinction n'a pas été confirmée, l'autonomie est peut-être allumée.", {
      cible: CLE_PLAFOND_AUTO,
      donnees: { demande, extinction_confirmee: coupe.ok },
    });
  } catch {
    /* le résultat rendu dit déjà l'essentiel */
  }
  return coupe;
}

/** Règle seulement le plafond, autonomie éteinte. */
export const envoyerPlafondAutomatique = (plafondCents: number) => envoyerAutonomie({ actif: false, plafondCents });

export type EtatStudio =
  | { connu: false; refus?: "contrat" }
  | { connu: true; automatique: boolean; plafond_cents: number; utilise_cents: number; mois: string; pilote: "usine" | "studio" | "aucun" };

/** État lu au Studio (lecture seule, sans rien écrire ici), donc lisible même sous « Tout arrêter » : sinon l'écran dirait à tort que le Studio se tait. Panne, refus ou réponse illisible : « inconnu » (échec fermé). */
export async function lireAutonomieStudio(): Promise<EtatStudio> {
  try {
    const r = await lireAutonomieDuStudio();
    if (r.envoye && r.statut === 426) return { connu: false, refus: "contrat" };
    if (!r.envoye || r.statut !== 200) return { connu: false };
    const l = reponseAutonomieStudio.safeParse(r.corps);
    if (!l.success) return { connu: false };
    return {
      connu: true,
      automatique: l.data.automatique,
      plafond_cents: l.data.plafond_automatique_cents,
      utilise_cents: l.data.utilise_automatique_cents,
      mois: l.data.mois,
      pilote: l.data.pilote,
    };
  } catch {
    return { connu: false };
  }
}

/**
 * « Tout arrêter » et « Éteindre » : envoie « éteint » au Studio sans passer par `sousArret`. Ne lève jamais.
 * Plafond envoyé avec « éteint » (il n'allume rien, `actif` vaut toujours false) : 1) celui lu au Studio, borné par PLAFOND_AUTO_MAX_CENTS ;
 * 2) à défaut (426, panne, réponse illisible), le dernier plafond noté par l'Usine ; 3) à défaut, 0. Ainsi l'extinction ne change pas le plafond du Studio quand on le connaît.
 */
export async function couperAutonomie(): Promise<ResultatPlafond> {
  let plafond = 0;
  try {
    const r = await lireAutonomieDuStudio();
    const l = r.envoye && r.statut === 200 ? reponseAutonomieStudio.safeParse(r.corps) : null;
    if (l?.success) plafond = Math.min(l.data.plafond_automatique_cents, PLAFOND_AUTO_MAX_CENTS);
    else plafond = (await lirePlafondAutomatique())?.plafond_cents ?? 0;
  } catch {
    plafond = (await lirePlafondAutomatique())?.plafond_cents ?? 0;
  }
  try {
    return await envoyerAutonomie({ actif: false, plafondCents: plafond }, { extinction: true });
  } catch {
    return { ok: false, raison: "sans_reponse" };
  }
}
