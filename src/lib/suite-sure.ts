/**
 * Adresse de retour après la connexion : seulement un chemin de l'Usine, jamais une autre adresse.
 * On analyse la valeur comme le ferait le navigateur (qui retire tabulations et sauts de ligne),
 * puis on vérifie qu'elle reste sur la même origine.
 */
const ORIGINE = "http://usine.invalid";

export function suiteSure(suite: unknown): string {
  if (typeof suite !== "string" || !suite.startsWith("/")) return "/";
  try {
    const u = new URL(suite, ORIGINE);
    return u.origin === ORIGINE ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}
