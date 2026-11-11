/** Passerelle de lecture seule du manifeste des bases de la source (API GitHub, jeton PLANS_PRIVE_LECTURE, dépôt nommé par PLANS_PRIVE_DEPOT). Appelée par la garde externe des bases. */
export const HOTE = "https://api.github.com";

/** `depot` = « propriétaire/nom », lu dans l'environnement par l'appelant ; jamais écrit dans le dépôt. */
export async function lireManifesteSource(jeton: string, depot: string): Promise<unknown> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(depot)) throw new Error("dépôt source mal formé");
  const reponse = await fetch(`${HOTE}/repos/${depot}/contents/usine/bases/pour-la-machine/MANIFESTE-BASES.json?ref=main`, {
    headers: { authorization: `Bearer ${jeton}`, accept: "application/vnd.github.raw+json", "x-github-api-version": "2022-11-28" },
    redirect: "error",
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  return reponse.json();
}
