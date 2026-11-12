/** Passerelle de lecture seule du manifeste des bases de la source (API GitHub, jeton PLANS_PRIVE_LECTURE, dépôt PLANS_PRIVE_DEPOT et chemin PLANS_PRIVE_MANIFESTE lus dans l'environnement). Appelée par la garde externe des bases. */
export const HOTE = "https://api.github.com";

/** `depot` = « propriétaire/nom », lu dans l'environnement par l'appelant ; jamais écrit dans le dépôt. */
/** Chemin d'API (sans « / » initial) du manifeste : `depot` = « propriétaire/nom », `chemin` = chemin du fichier dans ce dépôt. Les deux viennent de l'environnement. */
export function cheminManifeste(depot: string, chemin: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(depot) || depot.split("/").some((p) => p === "." || p === "..")) throw new Error("dépôt source mal formé");
  if (!/^[\w.-]+(\/[\w.-]+)*$/.test(chemin) || chemin.split("/").some((p) => p === "." || p === "..")) throw new Error("chemin du manifeste mal formé");
  return `repos/${depot}/contents/${chemin}?ref=main`;
}

export async function lireManifesteSource(jeton: string, depot: string, chemin: string): Promise<unknown> {
  const reponse = await fetch(`${HOTE}/${cheminManifeste(depot, chemin)}`, {
    headers: { authorization: `Bearer ${jeton}`, accept: "application/vnd.github.raw+json", "x-github-api-version": "2022-11-28" },
    redirect: "error",
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  return reponse.json();
}
