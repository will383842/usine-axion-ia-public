/** Le compte actif de chaque réseau : une page ou un compte avant un profil, puis l'ordre du code (résultat déterministe). */
import "server-only";
import { requete } from "@/lib/base";
import type { Reseau } from "@/contrats";

export async function comptesActifs(): Promise<Partial<Record<Reseau, string>>> {
  const lignes = await requete<{ reseau: Reseau; code: string }>(
    `SELECT DISTINCT ON (reseau) reseau, code FROM compte
      WHERE actif AND etat <> 'retire' AND archive_le IS NULL
      ORDER BY reseau, (nature = 'profil'), code`,
  );
  const sortie: Partial<Record<Reseau, string>> = {};
  for (const l of lignes) sortie[l.reseau] = l.code;
  return sortie;
}
