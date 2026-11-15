/** UO-07 · Historique des relevés : lecture seule, toutes les semaines passées et leurs corrections datées, par mot et par compte. */
import "server-only";
import { requete } from "@/lib/base";

export interface LigneHistorique {
  semaine: string;
  commentaires: number;
  messages: number;
  demandes_guide: number;
  abonnes_gagnes: number;
  saisi_le: string;
}

export interface GroupeHistorique {
  mot: string;
  compte: string;
  lignes: LigneHistorique[];
}

/** Rien n'est écrit ici. Semaines récentes d'abord ; pour une même semaine, la saisie la plus récente d'abord. */
export async function historiqueDesReleves(): Promise<GroupeHistorique[]> {
  const lignes = await requete<LigneHistorique & { mot: string; compte: string }>(
    `SELECT to_char(semaine, 'YYYY-MM-DD') AS semaine, mot, compte, commentaires, messages, demandes_guide, abonnes_gagnes,
            to_char(saisi_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS saisi_le
       FROM releve_mot_historique ORDER BY mot, compte, semaine DESC, saisi_le DESC, id DESC`,
  );
  const groupes: GroupeHistorique[] = [];
  for (const { mot, compte, ...ligne } of lignes) {
    let g = groupes[groupes.length - 1];
    if (!g || g.mot !== mot || g.compte !== compte) groupes.push((g = { mot, compte, lignes: [] }));
    g.lignes.push(ligne);
  }
  return groupes;
}
