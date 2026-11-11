/**
 * Garde propre de la route des chiffres du CRM (sans routePorte ni controlerAcces) : HMAC-SHA256 sur
 * `MÉTHODE \n chemin \n horodatage \n nonce \n SHA-256(corps)` (chemin SANS query, horodatage en secondes Unix,
 * SHA-256 en hexadécimal minuscule, corps vide pour un GET), comparaison en temps constant. En-têtes : X-Axion-Horodatage,
 * X-Axion-Nonce (16 octets, 32 hexadécimaux), X-Axion-Signature (64 hexadécimaux minuscules). Secret absent ou de moins de
 * 32 caractères : route éteinte (404). Le secret est lu par son NOM de variable seulement, jamais écrit ni journalisé.
 * CONTRAT : le secret est `trim()`é avant la HMAC, des deux côtés ; le CRM signe le chemin de la route, sans query.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { LONGUEUR_MIN_SECRET_AGREGATS, TOLERANCE_HORODATAGE_S, VARIABLE_AGREGATS } from "./regles";

export function secretAgregats(env: Record<string, string | undefined> = process.env): string | null {
  const s = env[VARIABLE_AGREGATS]?.trim() ?? "";
  return s.length >= LONGUEUR_MIN_SECRET_AGREGATS ? s : null;
}

export interface EnTetesSignes {
  horodatage: number;
  nonce: string;
  signature: string;
}

/** Les trois en-têtes, ou null s'ils manquent ou n'ont pas la bonne forme. */
export function lireEnTetes(h: { get(nom: string): string | null }): EnTetesSignes | null {
  const ts = h.get("x-axion-horodatage") ?? "";
  const nonce = h.get("x-axion-nonce") ?? "";
  const signature = h.get("x-axion-signature") ?? "";
  if (!/^\d{10}$/.test(ts) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  return { horodatage: Number(ts), nonce, signature };
}

export const horodatageAcceptable = (ts: number, maintenantMs = Date.now()) => Math.abs(maintenantMs / 1000 - ts) <= TOLERANCE_HORODATAGE_S;

export type Methode = "GET" | "POST";

export function signatureAttendue(secret: string, methode: Methode, chemin: string, e: Pick<EnTetesSignes, "horodatage" | "nonce">, corps: string): string {
  const sha = createHash("sha256").update(corps, "utf8").digest("hex");
  return createHmac("sha256", secret).update([methode, chemin, String(e.horodatage), e.nonce, sha].join("\n"), "utf8").digest("hex");
}

export function signatureValide(secret: string, methode: Methode, chemin: string, e: EnTetesSignes, corps: string): boolean {
  const attendue = Buffer.from(signatureAttendue(secret, methode, chemin, e, corps), "hex");
  return timingSafeEqual(attendue, Buffer.from(e.signature, "hex"));
}
