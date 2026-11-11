/** Passerelle de lecture seule du manifeste des bases dans axion-plans-prive (API GitHub, jeton PLANS_PRIVE_LECTURE). Appelée par la garde externe des bases. */
export const HOTE = "https://api.github.com";

export async function lireManifesteSource(jeton: string): Promise<unknown> {
  const reponse = await fetch(`${HOTE}/repos/will383842/axion-plans-prive/contents/usine/bases/pour-la-machine/MANIFESTE-BASES.json?ref=main`, {
    headers: { authorization: `Bearer ${jeton}`, accept: "application/vnd.github.raw+json", "x-github-api-version": "2022-11-28" },
    redirect: "error",
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  return reponse.json();
}
