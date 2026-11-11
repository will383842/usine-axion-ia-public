/**
 * N-26 · Code à usage unique d'une application d'authentification (RFC 6238 : HMAC-SHA-1, pas de 30 s, 6 chiffres).
 * Aucun SMS, aucun service extérieur : le code se calcule ici et dans l'application du téléphone.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PAS_SEC = 30;
export const CHIFFRES = 6;
/** Décalage d'horloge toléré : le pas d'avant et le pas d'après. */
const TOLERANCE = 1;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function versBase32(octets: Buffer): string {
  let bits = 0;
  let valeur = 0;
  let sortie = "";
  for (const o of octets) {
    valeur = (valeur << 8) | o;
    bits += 8;
    while (bits >= 5) {
      sortie += ALPHABET[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += ALPHABET[(valeur << (5 - bits)) & 31];
  return sortie;
}

function depuisBase32(texte: string): Buffer {
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];
  for (const c of texte.replace(/[\s=]/g, "").toUpperCase()) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error("Secret illisible.");
    valeur = (valeur << 5) | i;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(octets);
}

/** Un secret neuf : 20 octets tirés au hasard (160 bits, la taille de la RFC 4226), en base32. */
export function genererSecret(): string {
  return versBase32(randomBytes(20));
}

export function pasDe(maintenantMs: number): number {
  return Math.floor(maintenantMs / 1000 / PAS_SEC);
}

export function codeAuPas(secret: string, pas: number): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const h = createHmac("sha1", depuisBase32(secret)).update(compteur).digest();
  const decalage = h[h.length - 1] & 0x0f;
  const nombre = h.readUInt32BE(decalage) & 0x7fffffff;
  return String(nombre % 10 ** CHIFFRES).padStart(CHIFFRES, "0");
}

/**
 * Le pas auquel le code correspond (maintenant, celui d'avant ou celui d'après), ou null. Un pas inférieur ou égal
 * à `dernierPas` (déjà servi) n'est jamais accepté : un code ne sert qu'une fois. Comparaison en temps constant.
 */
export function trouverPas(secret: string, code: string, maintenantMs: number, dernierPas: number | null): number | null {
  const saisi = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${CHIFFRES}}$`).test(saisi)) return null;
  const actuel = pasDe(maintenantMs);
  let trouve: number | null = null;
  for (let pas = actuel - TOLERANCE; pas <= actuel + TOLERANCE; pas++) {
    const egal = timingSafeEqual(Buffer.from(codeAuPas(secret, pas)), Buffer.from(saisi));
    if (egal && trouve === null && (dernierPas === null || pas > dernierPas)) trouve = pas;
  }
  return trouve;
}

/** Le lien qui ouvre l'application d'authentification du téléphone (format « otpauth », lu par toutes). */
export function lienApplication(secret: string): string {
  const emetteur = encodeURIComponent("Usine Axion");
  return `otpauth://totp/${emetteur}:Will?secret=${secret}&issuer=${emetteur}&algorithm=SHA1&digits=${CHIFFRES}&period=${PAS_SEC}`;
}
