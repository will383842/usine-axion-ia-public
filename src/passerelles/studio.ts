/** Passerelle sortante vers le Studio (L7-23). Éteinte par défaut : interrupteur « studio.sortant » allumé ET secret STUDIO_PORTE_SECRET (32 caractères au moins, distinct du secret entrant) requis. */
import "server-only";
import { interrupteurAllume } from "@/donnees";

export const HOTE = "https://studio.axion-ia.com";
export const INTERRUPTEUR_STUDIO = "studio.sortant";

const SECRET_MIN = 32;
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
