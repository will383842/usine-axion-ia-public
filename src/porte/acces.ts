/**
 * Garde de la porte du studio : `Authorization: Bearer <USINE_PORTE_SECRET>`, comparé en temps constant
 * (empreintes SHA-256 de même longueur). Secret absent ou trop court côté serveur : la porte est éteinte (404).
 * Le proxy laisse passer /api/porte/** : cette garde est la seule, et chaque route l'appelle en premier.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { LONGUEUR_MIN_SECRET_PORTE, VARIABLE_PORTE } from "@/contrats";

export type AccesPorte = "eteinte" | "refuse" | "ouvert";

/** Le secret de la porte, ou null : porte éteinte. */
export function secretPorte(env: Record<string, string | undefined> = process.env): string | null {
  const s = env[VARIABLE_PORTE]?.trim() ?? "";
  return s.length >= LONGUEUR_MIN_SECRET_PORTE ? s : null;
}

const empreinte = (texte: string) => createHash("sha256").update(texte, "utf8").digest();

/** Vrai si l'en-tête porte exactement `Bearer <secret>`. */
export function enteteValide(entete: string | null, secret: string): boolean {
  const m = /^Bearer ([^\s]+)$/.exec(entete ?? "");
  // Comparaison faite même sans en-tête lisible : le temps de réponse ne dit rien.
  const egal = timingSafeEqual(empreinte(m?.[1] ?? ""), empreinte(secret));
  return Boolean(m) && egal;
}

export function controlerAcces(requete: Pick<Request, "headers">, env: Record<string, string | undefined> = process.env): AccesPorte {
  const secret = secretPorte(env);
  if (!secret) return "eteinte";
  return enteteValide(requete.headers.get("authorization"), secret) ? "ouvert" : "refuse";
}
