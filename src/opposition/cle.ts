/**
 * Clé d'une opposition (contrat § 8) : empreinte d'adresse, calculée comme au site (`GuideRequest.emailKey`),
 * ou `<reseau>:<compte de la personne>`. Aucune dépendance au serveur : testable seule.
 */
import { createHash } from "node:crypto";

/** Empreinte d'une adresse : minuscules, espaces retirés en début et fin, puis SHA-256 en hexadécimal. */
export function empreinteAdresse(adresse: string): string {
  return createHash("sha256").update(adresse.trim().toLowerCase(), "utf8").digest("hex");
}

export const FORME_EMPREINTE = /^[0-9a-f]{64}$/;
export const FORME_COMPTE = /^[a-z-]+:[a-z0-9._-]+$/;
const FORME_ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CleSaisie = { ok: true; cle: string; nature: "adresse" | "compte" } | { ok: false; message: string };

/**
 * Ce que Will a saisi → la clé gardée. Une adresse devient son empreinte (l'adresse n'est rendue nulle part) ;
 * un compte s'écrit `<reseau>:<compte>` en minuscules (« @ » de tête retiré).
 */
export function cleDepuisSaisie(saisie: string, reseau?: string): CleSaisie {
  const texte = saisie.trim();
  if (!texte) return { ok: false, message: "Indiquez une adresse ou un compte." };
  if (texte.includes("@") && !texte.startsWith("@")) {
    if (!FORME_ADRESSE.test(texte)) return { ok: false, message: "Cette adresse ne semble pas complète." };
    return { ok: true, cle: empreinteAdresse(texte), nature: "adresse" };
  }
  const compte = texte.replace(/^@/, "").toLowerCase();
  const cle = compte.includes(":") ? compte : `${(reseau ?? "").trim().toLowerCase()}:${compte}`;
  if (!FORME_COMPTE.test(cle)) return { ok: false, message: "Ce compte ne semble pas complet : choisissez le réseau et écrivez l'identifiant." };
  return { ok: true, cle, nature: "compte" };
}

/**
 * Une clé reçue par `estOpposee()` → la forme gardée en base. Empreinte : telle quelle (minuscules) ; adresse
 * reçue par mégarde : son empreinte ; compte : `<reseau>:<compte>` en minuscules, « @ » retiré, le réseau pris
 * dans la clé, sinon dans `reseau`. Clé vide, ou compte dont le réseau est inconnu : erreur (l'appelant n'envoie rien).
 */
export function cleDeRecherche(cle: string, reseau?: string): string {
  const texte = cle.trim();
  if (!texte) throw new Error("Clé d'opposition vide.");
  if (FORME_EMPREINTE.test(texte.toLowerCase())) return texte.toLowerCase();
  if (texte.includes("@") && !texte.startsWith("@") && !texte.includes(":")) return empreinteAdresse(texte);
  const [avant, apres] = texte.toLowerCase().split(/:(.*)/s);
  const [res, compte] = apres === undefined ? [(reseau ?? "").trim().toLowerCase(), avant] : [avant.trim(), apres];
  const normalisee = `${res}:${compte.trim().replace(/^@/, "")}`;
  if (!FORME_COMPTE.test(normalisee)) throw new Error("Clé d'opposition illisible : un compte s'écrit <reseau>:<compte>.");
  return normalisee;
}

/** Une clé telle qu'on peut la montrer à l'écran : jamais d'adresse, l'empreinte raccourcie. */
export function cleLisible(cle: string): string {
  return FORME_EMPREINTE.test(cle) ? `Adresse (empreinte ${cle.slice(0, 8)}…)` : cle;
}
