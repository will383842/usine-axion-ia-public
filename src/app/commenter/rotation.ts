import "server-only";
import { depots } from "@/donnees";
import type { CompteASuivre } from "@/donnees/types";
import { requete } from "@/lib/base";

export const COMPTES_PAR_JOUR = 7;

/**
 * Les comptes du jour : ceux déjà proposés aujourd'hui, complétés par les moins récemment proposés
 * (jamais proposés d'abord). Une seule requête pose le jour, donc deux ouvertures de page proposent les mêmes.
 */
export async function comptesDuJour(): Promise<CompteASuivre[]> {
  const deja = await requete<{ n: string }>(`SELECT count(*) AS n FROM compte_a_suivre WHERE archive_le IS NULL AND propose_le = current_date`);
  const manque = COMPTES_PAR_JOUR - Number(deja[0]?.n ?? 0);
  if (manque > 0) {
    await requete(
      `UPDATE compte_a_suivre SET propose_le = current_date, fait_le = NULL, modifie_le = now()
       WHERE code IN (
         SELECT code FROM compte_a_suivre
         WHERE archive_le IS NULL AND (propose_le IS NULL OR propose_le < current_date)
         ORDER BY propose_le ASC NULLS FIRST, code
         LIMIT $1 FOR UPDATE SKIP LOCKED)`,
      [manque],
    );
  }
  const lignes = await requete<CompteASuivre>(`SELECT * FROM compte_a_suivre WHERE archive_le IS NULL AND propose_le = current_date ORDER BY fait_le IS NOT NULL, code LIMIT $1`, [COMPTES_PAR_JOUR]);
  return lignes;
}

export const listeComplete = () => depots.compte_a_suivre.lister({ ordre: "nom" });
