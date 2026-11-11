/**
 * Jeton de session signé (jose HS256), cookie `usine_session`. Utilisé par src/proxy.ts ET par les services.
 * Le jeton porte une empreinte courte du hachage du mot de passe en vigueur (variable ou réglage) : changer le
 * mot de passe coupe toutes les sessions ouvertes, sans table de sessions.
 * N-26 : `sc` est le téléphone dont le second code a été vérifié. Sans lui, la session n'est que partielle et
 * n'ouvre que /connexion (src/auth/session.ts) ; archiver le téléphone coupe toutes les sessions qui le portent.
 * La session partielle porte en plus `etape: "mdp"` (exigée, avec une durée d'au plus 15 min) : un jeton d'avant
 * N-26 (ni `sc` ni `etape`, jusqu'à 30 jours) ne vaut ni session partielle ni session complète.
 */
import { jwtVerify, SignJWT } from "jose";
import { hachageEnVigueur } from "./mot-de-passe";

export const NOM_COOKIE_SESSION = "usine_session";
export const DUREE_LONGUE_SEC = 30 * 24 * 3600; // « Rester connecté » : 30 jours
export const DUREE_COURTE_SEC = 12 * 3600; // sinon 12 heures
export const DUREE_PARTIELLE_SEC = 15 * 60; // mot de passe accepté, second code attendu
const AUDIENCE = "usine-axion-ia";

export interface ContenuJeton {
  jti: string;
  rc: boolean; // rester connecté
  iat?: number;
  sc?: string; // N-26 : téléphone dont le second code a été vérifié (absent : session partielle)
  etape?: "mdp"; // N-26 : session partielle (mot de passe accepté, second code attendu)
  exp?: number;
}

function cle(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET absent ou trop court (32 caractères au moins).");
  return new TextEncoder().encode(secret);
}

/** Empreinte courte (SHA-256, 16 caractères) du hachage donné, sinon du hachage en vigueur. */
export async function empreinteMotDePasse(hashB64?: string): Promise<string> {
  const h = hashB64 ?? (await hachageEnVigueur())?.hashB64 ?? "";
  const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(h));
  return Array.from(new Uint8Array(octets), (o) => o.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export async function signerJeton(contenu: ContenuJeton, dureeSec: number, maintenantSec = Math.floor(Date.now() / 1000)): Promise<string> {
  return new SignJWT({ rc: contenu.rc, mp: await empreinteMotDePasse(), ...(contenu.sc ? { sc: contenu.sc } : {}), ...(contenu.etape ? { etape: contenu.etape } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(contenu.jti)
    .setIssuedAt(maintenantSec)
    .setExpirationTime(maintenantSec + dureeSec)
    .setAudience(AUDIENCE)
    .sign(cle());
}

/**
 * Témoin `usine_appareil` : posé à chaque connexion réussie, signé HS256 avec le même secret, un an, avec un
 * identifiant tiré au hasard et l'empreinte du mot de passe (le changer rend les témoins caducs). L'appareil qui le
 * présente est compté par son identifiant, plus par son adresse, et échappe à la limite globale. Il n'ouvre aucune session.
 */
export const NOM_COOKIE_APPAREIL = "usine_appareil";
export const DUREE_APPAREIL_SEC = 365 * 24 * 3600;
const AUDIENCE_APPAREIL = "usine-axion-ia:appareil";

export async function signerAppareil(maintenantSec = Math.floor(Date.now() / 1000)): Promise<string> {
  return new SignJWT({ mp: await empreinteMotDePasse() })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt(maintenantSec)
    .setExpirationTime(maintenantSec + DUREE_APPAREIL_SEC)
    .setAudience(AUDIENCE_APPAREIL)
    .sign(cle());
}

/** L'identifiant de l'appareil, ou null si le témoin est absent, mal signé, expiré, ou émis avant un changement de mot de passe. */
export async function verifierAppareil(jeton: string | undefined): Promise<string | null> {
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, cle(), { algorithms: ["HS256"], audience: AUDIENCE_APPAREIL });
    if (typeof payload.jti !== "string" || payload.mp !== (await empreinteMotDePasse())) return null;
    return payload.jti;
  } catch {
    return null;
  }
}

/** Contenu du jeton, ou null s'il est absent, mal signé, expiré, ou émis avant un changement de mot de passe. */
export async function verifierJeton(jeton: string | undefined): Promise<ContenuJeton | null> {
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, cle(), { algorithms: ["HS256"], audience: AUDIENCE });
    if (typeof payload.jti !== "string") return null;
    if (payload.mp !== (await empreinteMotDePasse())) return null;
    return {
      jti: payload.jti,
      rc: payload.rc === true,
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
      sc: typeof payload.sc === "string" && payload.sc ? payload.sc : undefined,
      etape: payload.etape === "mdp" ? "mdp" : undefined,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}
