/**
 * CONNEXION (compte unique, celui de Will), même principe que le studio :
 * - mot de passe seul, vérifié par argon2id contre le hachage en vigueur (`USINE_PASSWORD_HASH_B64`, sinon le
 *   réglage `connexion.hachage` écrit par Will à la première ouverture) ;
 * - 5 échecs en 15 min par adresse (IPv6 : par /64), 30 toutes adresses confondues ; un appareil connu (témoin
 *   `usine_appareil`) compte à part, 5 échecs par appareil → attente (fenêtre glissante de 15 min) (connexion,
 *   première ouverture, changement) ; chaque essai est compté avant d'être fait (essais simultanés) ; une panne de
 *   base n'est pas comptée comme un échec ; temps de réponse constant ;
 * - cookie `usine_session` httpOnly, Secure en production, SameSite=Lax, jeton signé HS256 ; 30 j ou 12 h ;
 * - N-26 : le mot de passe n'ouvre qu'une session PARTIELLE (15 min) ; seul le second code (application du
 *   téléphone) l'ouvre en entier. Sans téléphone enregistré, l'enregistrement est imposé ; tant qu'il n'est pas fait,
 *   exigerSession() refuse tout (pages, actions serveur, routes /api) et le proxy ne laisse passer que /connexion.
 * - SCC-3 : si `connexion.second-code-courriel` est allumé (par l'essai réussi de /reglages/second-code), le second code
 *   arrive par courriel (src/auth/courriel.ts) et la session complète porte `scm` ; il l'emporte sur l'application.
 * - U-SECOND-CODE-ETEINT : cela, seulement si l'interrupteur `connexion.second-code` est allumé (src/auth/exigence.ts ;
 *   livré éteint). Éteint, le mot de passe seul ouvre la session complète ; lecture impossible = exigé.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { empreinte } from "@/auth/chiffrement";
import { emettreCode, mettreEnService, verifierCode } from "@/auth/courriel";
import { lireExigence, modeSecondCode } from "@/auth/exigence";
import { courrielConfigure } from "@/passerelles/courriel";
import { confirmerSecondCode, enregistrementPermis, preparerSecondCode, utiliserCodeSecours, verifierSecondCode } from "@/auth/second-code";
import { idSecondCodeActif, sessionComplete, sessionPartielle } from "@/auth/session";
import { journaliser } from "@/donnees";
import { baseConfiguree } from "@/lib/base";
import {
  DUREE_APPAREIL_SEC,
  DUREE_COURTE_SEC,
  DUREE_LONGUE_SEC,
  DUREE_PARTIELLE_SEC,
  NOM_COOKIE_APPAREIL,
  NOM_COOKIE_SESSION,
  signerAppareil,
  signerJeton,
  verifierAppareil,
  type ContenuJeton,
} from "@/lib/jeton-session";
import {
  adresseDepuisEntetes,
  changerHachage,
  enregistrerPremierHachage,
  hachageEnVigueur,
  LimiteEssais,
  verifierMotDePasse,
  type HachageEnVigueur,
  type Resultat,
} from "@/lib/mot-de-passe";

const DUREE_REPONSE_MS = 800;
const cleLimite = Symbol.for("usine-axion-ia.limite-essais");
function limite(): LimiteEssais {
  const g = globalThis as typeof globalThis & { [cleLimite]?: LimiteEssais };
  g[cleLimite] ??= new LimiteEssais();
  return g[cleLimite];
}

async function attendre(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

async function ipRequete(): Promise<string> {
  return adresseDepuisEntetes(await headers());
}

async function noter(message: string) {
  if (!baseConfiguree()) return;
  await journaliser("connexion", message).catch(() => undefined);
}

export type ResultatConnexion = Resultat;

const SECOND_CODE_ETEINT = "Le second code n'est pas demandé pour le moment. Connectez-vous avec votre mot de passe.";

const TROP_D_ESSAIS = "Trop d'essais. Réessayez dans 15 minutes.";
const BASE_MUETTE = "La base ne répond pas. Réessayez dans un instant.";

async function poserJeton(jeton: string, duree: number): Promise<void> {
  (await cookies()).set(NOM_COOKIE_SESSION, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: duree,
  });
}

/** Mot de passe accepté : session partielle, qui n'ouvre que /connexion (second code). */
async function ouvrirSessionPartielle(resterConnecte: boolean): Promise<string> {
  const jti = randomUUID();
  await poserJeton(await signerJeton({ jti, rc: resterConnecte, etape: "mdp" }, DUREE_PARTIELLE_SEC), DUREE_PARTIELLE_SEC);
  return jti;
}

/** Mot de passe ET second code acceptés : la session porte le téléphone vérifié (`sc`). */
async function ouvrirSession(resterConnecte: boolean, sc?: string, scm?: string): Promise<void> {
  const duree = resterConnecte ? DUREE_LONGUE_SEC : DUREE_COURTE_SEC;
  await poserJeton(await signerJeton({ jti: randomUUID(), rc: resterConnecte, ...(sc ? { sc } : {}), ...(scm ? { scm } : {}) }, duree), duree);
  (await cookies()).set(NOM_COOKIE_APPAREIL, await signerAppareil(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DUREE_APPAREIL_SEC,
  });
}

async function appareilConnu(): Promise<string | null> {
  return verifierAppareil((await cookies()).get(NOM_COOKIE_APPAREIL)?.value);
}

/**
 * Ce que montre /connexion : le formulaire, la première ouverture, « pas encore ouverte » ; après le mot de passe
 * (session partielle) : l'enregistrement imposé d'un téléphone, ou son code ; session complète : « ouverte ».
 */
export async function etatConnexion(): Promise<"connexion" | "premiere" | "fermee" | "enregistrer" | "second-code" | "code-courriel" | "ouverte" | "connecte"> {
  const mode = await modeSecondCode();
  const exige = mode !== "aucun";
  const partielle = exige ? await lireSessionPartielle() : null;
  if (partielle && mode === "courriel") return "code-courriel";
  if (partielle) {
    try {
      // Après une remise, seule la session qui y a droit enregistre un téléphone ; les autres voient l'écran du code
      // (code de secours compris).
      return !(await idSecondCodeActif()) && (await enregistrementPermis(partielle)) ? "enregistrer" : "second-code";
    } catch {
      return "second-code";
    }
  }
  // Second code non exigé : une session complète n'a rien à montrer ici (la page renvoie vers l'Usine).
  if (await lireSession()) return mode === "application" ? "ouverte" : "connecte";
  try {
    if (await hachageEnVigueur()) return "connexion";
  } catch {
    return "connexion";
  }
  return process.env.USINE_PREMIERE_OUVERTURE === "oui" ? "premiere" : "fermee";
}

/** D'où vient le hachage en vigueur (pour l'écran « Changer mon mot de passe »). */
export async function sourceMotDePasse(): Promise<HachageEnVigueur["source"] | null> {
  await exigerSession();
  return (await hachageEnVigueur())?.source ?? null;
}

/** Applique la limite d'essais et le temps de réponse constant à une tentative (une erreur de base vaut un refus, pas un échec). */
async function tenter(essai: () => Promise<Resultat>, apresSucces: () => Promise<void>): Promise<Resultat> {
  const debut = Date.now();
  const ip = await ipRequete();
  const appareil = await appareilConnu();
  // Bloqué : rien n'est tenté (une première ouverture ou un changement écrirait). Sinon l'essai est compté comme un
  // échec avant d'être fait : des essais lancés ensemble ne passent pas tous avant le premier échec noté.
  const quand = Date.now();
  if (!limite().reserver(ip, quand, appareil)) {
    await attendre(DUREE_REPONSE_MS - (Date.now() - debut));
    return { ok: false, message: TROP_D_ESSAIS };
  }
  let panne = false;
  const r = await essai().catch((): Resultat => {
    panne = true;
    return { ok: false, message: BASE_MUETTE };
  });
  if (!r.ok) {
    if (panne) limite().rendre(ip, quand, appareil);
    await attendre(DUREE_REPONSE_MS - (Date.now() - debut));
    return !panne && limite().bloque(ip, Date.now(), appareil) ? { ok: false, message: TROP_D_ESSAIS } : r;
  }
  limite().rendre(ip, quand, appareil);
  limite().oublier(ip, appareil);
  await apresSucces();
  await attendre(DUREE_REPONSE_MS - (Date.now() - debut));
  return r;
}

/** Mot de passe accepté : session complète si le second code n'est pas exigé, sinon session partielle. */
async function ouvrirApresMotDePasse(resterConnecte: boolean): Promise<boolean> {
  const mode = await modeSecondCode();
  if (mode !== "aucun") {
    const jti = await ouvrirSessionPartielle(resterConnecte);
    // Courriel : le code part tout de suite. Un échec n'est pas montré ici : l'écran « Votre code » propose « Renvoyer le code ».
    if (mode === "courriel") await emettreCode("connexion", jti).catch(() => undefined);
    return false;
  }
  await ouvrirSession(resterConnecte);
  return true; // /connexion renvoie alors vers l'Usine (état « connecte »)
}

export async function seConnecter(motDePasse: string, resterConnecte: boolean): Promise<ResultatConnexion> {
  return tenter(
    async () => {
      const actuel = await hachageEnVigueur();
      const correct = await verifierMotDePasse(motDePasse, actuel?.hashB64);
      if (!actuel) return { ok: false, message: "L'Usine n'est pas encore ouverte." };
      return correct ? { ok: true } : { ok: false, message: "Mot de passe incorrect." };
    },
    async () => {
      const ouverte = await ouvrirApresMotDePasse(resterConnecte);
      await noter(ouverte ? "Mot de passe accepté : connexion de Will (second code non demandé)." : "Mot de passe accepté : second code demandé.");
    },
  );
}

/** Première ouverture : Will choisit son mot de passe, puis il est connecté. */
export async function premiereOuverture(motDePasse: string, confirmation: string, resterConnecte: boolean): Promise<ResultatConnexion> {
  return tenter(
    () => enregistrerPremierHachage(motDePasse, confirmation),
    async () => {
      await noter("Première ouverture : Will a choisi son mot de passe.");
      await ouvrirApresMotDePasse(resterConnecte);
    },
  );
}

/** Changer son mot de passe : les autres sessions sont coupées (empreinte), celle-ci est rouverte. */
export async function changerMotDePasse(ancien: string, nouveau: string, confirmation: string): Promise<ResultatConnexion> {
  const session = await exigerSession();
  return tenter(
    () => changerHachage(ancien, nouveau, confirmation),
    async () => {
      await noter("Mot de passe changé : les autres appareils sont déconnectés.");
      await ouvrirSession(session.rc, session.sc, session.scm);
    },
  );
}

/** La session complète (mot de passe ET second code), ou null. */
export async function lireSession(): Promise<ContenuJeton | null> {
  return sessionComplete((await cookies()).get(NOM_COOKIE_SESSION)?.value);
}

/** Session partielle : mot de passe accepté (`etape: "mdp"`, 15 min au plus), second code pas encore vérifié. */
async function lireSessionPartielle(): Promise<ContenuJeton | null> {
  return sessionPartielle((await cookies()).get(NOM_COOKIE_SESSION)?.value);
}

/**
 * À APPELER EN PREMIÈRE LIGNE DE CHAQUE PAGE PROTÉGÉE, ACTION SERVEUR ET ROUTE /api. Sans session complète
 * (mot de passe ET second code) : /connexion.
 */
export async function exigerSession(): Promise<ContenuJeton> {
  const session = await lireSession();
  if (!session) redirect("/connexion");
  return session;
}

export async function seDeconnecter(): Promise<void> {
  (await cookies()).set(NOM_COOKIE_SESSION, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  await noter("Déconnexion.");
}

// N-26 · Second code. Chaque étape exige la session partielle (le mot de passe vient d'être accepté).

const SANS_MOT_DE_PASSE = "Entrez d'abord votre mot de passe.";

/** Même temps de réponse pour chaque essai ; une panne de base est un refus, jamais un succès. */
async function enTempsConstant<T extends { ok: boolean }>(essai: () => Promise<T | { ok: false; message: string }>): Promise<T | { ok: false; message: string }> {
  const debut = Date.now();
  const r = await essai().catch(() => ({ ok: false as const, message: BASE_MUETTE }));
  await attendre(DUREE_REPONSE_MS - (Date.now() - debut));
  return r;
}

/** Tire le secret d'un nouveau téléphone et le rend UNE SEULE FOIS (il n'est jamais relu ni réaffiché). */
export async function commencerSecondCode(): Promise<{ ok: true; secret: string; lien: string } | { ok: false; message: string }> {
  if ((await modeSecondCode()) !== "application") return { ok: false, message: SECOND_CODE_ETEINT };
  const partielle = await lireSessionPartielle();
  if (!partielle) return { ok: false, message: SANS_MOT_DE_PASSE };
  const r = await preparerSecondCode(partielle).catch(() => ({ ok: false as const, message: BASE_MUETTE }));
  if (r.ok) await noter("Second code : un secret a été montré pour enregistrer un téléphone.");
  return r;
}

/** Premier code du nouveau téléphone : il est enregistré, la session s'ouvre, les codes de secours sont rendus une fois. */
export async function enregistrerSecondCode(code: string): Promise<{ ok: true; codesSecours: string[] } | { ok: false; message: string }> {
  if ((await modeSecondCode()) !== "application") return { ok: false, message: SECOND_CODE_ETEINT };
  const partielle = await lireSessionPartielle();
  if (!partielle) return { ok: false, message: SANS_MOT_DE_PASSE };
  return enTempsConstant(async () => {
    const r = await confirmerSecondCode(code, partielle);
    if (!r.ok) return r;
    await ouvrirSession(partielle.rc, r.id);
    await noter("Second code enregistré : connexion de Will.");
    return { ok: true as const, codesSecours: r.codesSecours };
  });
}

/** Code de l'application : la session s'ouvre en entier. */
export async function entrerSecondCode(code: string): Promise<Resultat> {
  if ((await modeSecondCode()) !== "application") return { ok: false, message: SECOND_CODE_ETEINT };
  const partielle = await lireSessionPartielle();
  if (!partielle) return { ok: false, message: SANS_MOT_DE_PASSE };
  return enTempsConstant(async () => {
    const r = await verifierSecondCode(code);
    if (!r.ok) return r;
    await ouvrirSession(partielle.rc, r.id);
    await noter("Second code vérifié : connexion de Will.");
    return { ok: true as const };
  });
}

/** Téléphone perdu : un code de secours (une fois). L'Usine ne s'ouvre pas : un nouveau téléphone est à enregistrer. */
export async function entrerCodeSecours(code: string): Promise<Resultat> {
  if ((await modeSecondCode()) !== "application") return { ok: false, message: SECOND_CODE_ETEINT };
  const partielle = await lireSessionPartielle();
  if (!partielle) return { ok: false, message: SANS_MOT_DE_PASSE };
  return enTempsConstant(async () => {
    const appareil = await appareilConnu();
    const origine = appareil ? `appareil:${empreinte(appareil)}` : `adresse:${empreinte(await ipRequete())}`;
    const r = await utiliserCodeSecours(code, origine, partielle.jti);
    if (r.ok) await noter("Code de secours utilisé : l'ancien téléphone ne vaut plus, un nouveau est à enregistrer.");
    return r;
  });
}

// SCC-3 · Second code par courriel. Mêmes exigences que l'application : la session partielle (mot de passe accepté).

const COURRIEL_ETEINT = "Le second code par courriel n'est pas demandé pour le moment. Connectez-vous avec votre mot de passe.";
const TOTP_ALLUME = "Éteignez d'abord « Second code à la connexion ».";

/** Code reçu par courriel : la session s'ouvre en entier, avec `scm` (la mise en service en vigueur). */
export async function entrerCodeCourriel(code: string): Promise<Resultat> {
  if ((await modeSecondCode()) !== "courriel") return { ok: false, message: COURRIEL_ETEINT };
  const partielle = await lireSessionPartielle();
  if (!partielle) return { ok: false, message: SANS_MOT_DE_PASSE };
  return enTempsConstant(async () => {
    const r = await verifierCode("connexion", code, partielle.jti);
    if (!r.ok) return r;
    const e = await lireExigence();
    if (e.mode !== "courriel" || !e.service) return { ok: false as const, message: COURRIEL_ETEINT };
    await ouvrirSession(partielle.rc, undefined, e.service);
    await noter("Second code par courriel vérifié : connexion de Will.");
    return { ok: true as const };
  });
}

/** « Renvoyer le code » : un nouveau code (limites de src/auth/courriel.ts), l'ancien est archivé. */
export async function renvoyerCodeCourriel(): Promise<Resultat> {
  if ((await modeSecondCode()) !== "courriel") return { ok: false, message: COURRIEL_ETEINT };
  const partielle = await lireSessionPartielle();
  if (!partielle) return { ok: false, message: SANS_MOT_DE_PASSE };
  return enTempsConstant(async () => emettreCode("connexion", partielle.jti));
}

/**
 * Essai de mise en service, étape 1 (depuis Réglages) : session complète ET mot de passe retapé (limite d'essais
 * comprise), puis un code de type « mise en service » part à l'adresse du serveur. Un cookie volé seul ne suffit pas.
 */
export async function envoyerCodeEssai(motDePasse: string): Promise<Resultat> {
  const session = await exigerSession();
  let envoi: Resultat = { ok: true };
  const r = await tenter(
    async () => {
      const actuel = await hachageEnVigueur();
      const correct = await verifierMotDePasse(motDePasse, actuel?.hashB64);
      return actuel && correct ? { ok: true } : { ok: false, message: "Mot de passe incorrect." };
    },
    async () => {
      if ((await modeSecondCode()) === "application") envoi = { ok: false, message: TOTP_ALLUME };
      else envoi = await emettreCode("mise_en_service", session.jti);
    },
  );
  return r.ok ? envoi : r;
}

/**
 * Essai de mise en service, étape 2 : le bon code allume l'interrupteur (une seule transaction, src/auth/courriel.ts)
 * et la session en cours est réémise avec `scm` : Will reste connecté, toutes les autres sessions tombent.
 */
export async function validerCodeEssai(code: string): Promise<Resultat> {
  const session = await exigerSession();
  return enTempsConstant(async () => {
    const r = await mettreEnService(code, session.jti);
    if (!r.ok) return r;
    await ouvrirSession(session.rc, undefined, r.id);
    return { ok: true as const };
  });
}

/** Ce que montre l'écran d'essai (aucune valeur du serveur) : l'envoi est-il réglé, le second code par courriel est-il allumé. */
export async function etatEssaiCourriel(): Promise<{ regle: boolean; allume: boolean; application: boolean }> {
  await exigerSession();
  const mode = await modeSecondCode();
  return { regle: courrielConfigure() && (process.env.USINE_COURRIEL_SECOND_CODE ?? "") !== "", allume: mode === "courriel", application: mode === "application" };
}
