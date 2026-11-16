/** UO-08 · Export des chiffres du mois et du calendrier du mois : lecture seule, aucune donnée de personne, aucun montant. */
import "server-only";
import { requete } from "@/lib/base";
import { bornesDuMois, dateFrancaise, versCsv } from "./csv";

export * from "./csv";

export const ENTETES_CHIFFRES = ["Semaine du", "Mot", "Compte", "Commentaires", "Messages", "Demandes de guide", "Abonnés gagnés"];
export const ENTETES_CALENDRIER = ["Date", "Réseau", "Type", "État"];

/** Relevés des semaines (lundis) du mois. Les lundis sont des dates : le mois est celui de Paris. */
export async function csvDesChiffres(mois: string): Promise<string> {
  const { debut, fin } = bornesDuMois(mois);
  const l = await requete<{ semaine: string; mot: string; compte: string; commentaires: number; messages: number; demandes_guide: number; abonnes_gagnes: number }>(
    `SELECT to_char(semaine, 'YYYY-MM-DD') AS semaine, mot, compte, commentaires, messages, demandes_guide, abonnes_gagnes
       FROM releve_mot WHERE archive_le IS NULL AND semaine >= $1::date AND semaine < $2::date ORDER BY semaine, mot, compte`,
    [debut, fin],
  );
  return versCsv(ENTETES_CHIFFRES, l.map((r) => [dateFrancaise(r.semaine), r.mot, r.compte, String(r.commentaires), String(r.messages), String(r.demandes_guide), String(r.abonnes_gagnes)]));
}

/** Cases du calendrier du mois (heure de Paris) : date, réseau, type, état. */
export async function csvDuCalendrier(mois: string): Promise<string> {
  const { debut, fin } = bornesDuMois(mois);
  const l = await requete<{ jour: string; reseau: string; type_contenu: string; etat: string }>(
    `SELECT to_char(prevue_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS jour, reseau, type_contenu, etat
       FROM calendrier_ligne
      WHERE archive_le IS NULL AND (prevue_le AT TIME ZONE 'Europe/Paris')::date >= $1::date AND (prevue_le AT TIME ZONE 'Europe/Paris')::date < $2::date
      ORDER BY prevue_le, reseau, id`,
    [debut, fin],
  );
  return versCsv(ENTETES_CALENDRIER, l.map((r) => [dateFrancaise(r.jour), r.reseau, r.type_contenu, r.etat]));
}
