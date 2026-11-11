/**
 * N-26 · Le secret du second code est gardé CHIFFRÉ en base (AES-256-GCM, authentifié). La clé n'est jamais en
 * base ni dans le dépôt : elle est dérivée (HKDF-SHA-256) de SESSION_SECRET, variable du serveur, avec un usage
 * propre. Changer SESSION_SECRET rend le secret illisible : la connexion échoue fermée, il faut alors une remise à
 * zéro (voir migrations/027-second-code.sql).
 * Même source, autre libellé : la clé HMAC des empreintes (adresse, appareil, jeton) notées dans les remises.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";
const USAGE = "usine-axion-ia:second-code:v1";
const USAGE_EMPREINTE = "usine-axion-ia:empreinte-remise:v1";
const LIEN = Buffer.from("second_code.secret_chiffre");

function cle(usage = USAGE): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET absent ou trop court (32 caractères au moins).");
  return Buffer.from(hkdfSync("sha256", secret, "usine-axion-ia", usage, 32));
}

/**
 * Empreinte courte (HMAC-SHA-256 avec une clé du serveur, 16 caractères) : la trace d'une remise ne garde ni
 * l'adresse, ni l'appareil, ni le jeton en clair, et sans la clé on ne retrouve pas une adresse en les essayant toutes.
 */
export function empreinte(valeur: string): string {
  return createHmac("sha256", cle(USAGE_EMPREINTE)).update(valeur).digest("hex").slice(0, 16);
}

export function chiffrer(texte: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cle(), iv);
  c.setAAD(LIEN);
  const corps = Buffer.concat([c.update(texte, "utf8"), c.final()]);
  return `${VERSION}:${Buffer.concat([iv, c.getAuthTag(), corps]).toString("base64")}`;
}

/** Le texte en clair ; lève une erreur si l'enveloppe est modifiée ou si la clé a changé. */
export function dechiffrer(enveloppe: string): string {
  const [version, b64] = enveloppe.split(":");
  if (version !== VERSION || !b64) throw new Error("Enveloppe illisible.");
  const brut = Buffer.from(b64, "base64");
  if (brut.length < 29) throw new Error("Enveloppe illisible.");
  const d = createDecipheriv("aes-256-gcm", cle(), brut.subarray(0, 12));
  d.setAAD(LIEN);
  d.setAuthTag(brut.subarray(12, 28));
  return Buffer.concat([d.update(brut.subarray(28)), d.final()]).toString("utf8");
}
