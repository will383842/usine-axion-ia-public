/**
 * Lecture du corps par morceaux avec une limite propre à la route des chiffres du CRM (pas les 16 Ko de la porte du studio) :
 * s'arrête dès que la limite est dépassée, même sans `content-length` (ou avec un faux). `src/porte/` reste inchangé.
 */
export class CorpsTropGrand extends Error {}

export async function lireCorpsLimite(requete: Request, max: number): Promise<string> {
  if (!requete.body) return "";
  const lecteur = requete.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lecteur.cancel();
      throw new CorpsTropGrand();
    }
    morceaux.push(value);
  }
  return Buffer.concat(morceaux).toString("utf8");
}
