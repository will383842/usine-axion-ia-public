/** Passerelle sortante vers le Studio (L7-23). Éteinte par défaut : interrupteur « studio.sortant » allumé ET secret STUDIO_PORTE_SECRET (32 caractères au moins, distinct du secret entrant) requis. */
import "server-only";
import { interrupteurAllume } from "@/donnees";
import { PLAFOND_AUTO_MAX_CENTS, corpsPlafondStudio } from "@/contrats";

export const HOTE = "https://studio.axion-ia.com";
export const INTERRUPTEUR_STUDIO = "studio.sortant";

const SECRET_MIN = 32;
/** Délai maximal d'un appel : sans réponse au bout de 10 s, l'appel échoue (l'écran ne reste jamais bloqué). */
const DELAI_MAX_MS = 10_000;
const CHEMIN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i;

export type ReponseStudio = { envoye: false } | { envoye: true; statut: number; corps: unknown };

/** Envoie `corps` en JSON au Studio, sur `/api/<chemin>`. Rend `{ envoye: false }`, sans aucun appel, tant que l'interrupteur ou le secret manque. */
export async function appelerStudio(chemin: string, corps: unknown): Promise<ReponseStudio> {
  if (!CHEMIN.test(chemin)) throw new Error("chemin du Studio mal formé");
  const secret = process.env.STUDIO_PORTE_SECRET ?? "";
  if (secret.length < SECRET_MIN || !(await interrupteurAllume(INTERRUPTEUR_STUDIO))) return { envoye: false };
  const reponse = await fetch(`${HOTE}/api/${chemin}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(corps),
    redirect: "error",
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
  const texte = await reponse.text();
  let json: unknown = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    json = null;
  }
  return { envoye: true, statut: reponse.status, corps: json };
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Lit (GET) les créneaux déjà pris du Studio entre deux jours (31 au plus, contrôlé par le Studio). Rend `{ envoye: false }`, sans aucun appel, tant que l'interrupteur ou le secret manque. Lecture seule. */
export async function lireOccupesDuStudio(du: string, au: string): Promise<ReponseStudio> {
  if (!JOUR.test(du) || !JOUR.test(au)) throw new Error("jours du Studio mal formés");
  const secret = process.env.STUDIO_PORTE_SECRET ?? "";
  if (secret.length < SECRET_MIN || !(await interrupteurAllume(INTERRUPTEUR_STUDIO))) return { envoye: false };
  const reponse = await fetch(`${HOTE}/api/usine/calendrier/occupes?du=${du}&au=${au}&contrat=2`, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
  const texte = await reponse.text();
  let json: unknown = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    json = null;
  }
  return { envoye: true, statut: reponse.status, corps: json };
}

/**
 * Lit (POST, lecture seule) l'état de l'autonomie au Studio : allumée ou non, plafond, dépensé ce mois-ci. Aucune écriture côté Studio.
 * Rend `{ envoye: false }`, sans aucun appel, tant que l'interrupteur ou le secret manque.
 */
export async function lireAutonomieDuStudio(): Promise<ReponseStudio> {
  const secret = process.env.STUDIO_PORTE_SECRET ?? "";
  if (secret.length < SECRET_MIN || !(await interrupteurAllume(INTERRUPTEUR_STUDIO))) return { envoye: false };
  const reponse = await fetch(`${HOTE}/api/usine/reglages/autonomie`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: "{}",
    redirect: "error",
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
  const texte = await reponse.text();
  let json: unknown = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    json = null;
  }
  return { envoye: true, statut: reponse.status, corps: json };
}

/**
 * Envoie (PUT) l'état de l'autonomie et son plafond au Studio, en centimes entiers de 0 à PLAFOND_AUTO_MAX_CENTS (sinon lève, sans aucun appel ; allumer avec 0 lève aussi).
 * L'état est un paramètre : seul l'appelant décide. Dans l'Usine, « allumé » ne part que de l'action d'allumage, après la confirmation « allumer »,
 * sur l'ordre écrit du fondateur du 25/11 (« oui sur l'autonomie de l'usine » ; plafond de 20 € réglable par l'écran de l'Usine).
 * Rend `{ envoye: false }`, sans aucun appel, tant que l'interrupteur ou le secret manque.
 */
export async function reglerPlafondDuStudio(automatique: boolean, plafondCents: number): Promise<ReponseStudio> {
  if (!Number.isSafeInteger(plafondCents) || plafondCents < 0 || plafondCents > PLAFOND_AUTO_MAX_CENTS) throw new Error("plafond du Studio hors bornes");
  const corps = corpsPlafondStudio.parse({ contrat: 2, automatique, plafond_automatique_cents: plafondCents });
  const secret = process.env.STUDIO_PORTE_SECRET ?? "";
  if (secret.length < SECRET_MIN || !(await interrupteurAllume(INTERRUPTEUR_STUDIO))) return { envoye: false };
  const reponse = await fetch(`${HOTE}/api/usine/reglages/budget`, {
    method: "PUT",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(corps),
    redirect: "error",
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
  const texte = await reponse.text();
  let json: unknown = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    json = null;
  }
  return { envoye: true, statut: reponse.status, corps: json };
}
