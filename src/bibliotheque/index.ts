/**
 * UO-03 · bibliothèque (fabriqué ou publié), « Refusés » et « Refaire ».
 * Lecture seule sauf `refaire()` : une NOUVELLE ligne dans le lot de reprises (brouillon), sans paquet, sans code ni signature ;
 * la ligne d'origine n'est jamais modifiée. « Tout arrêter » (U-ARRET, via U-COMMANDE) bloque « Refaire ».
 */
import "server-only";
import { sousArret } from "@/arret";
import { interrupteurAllume, journaliser, prochainLot } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { INTERRUPTEUR_LOTS } from "@/lots/regles";
import { ETATS_BIBLIOTHEQUE, ETATS_REFAISABLES, MAX_LIGNES, PHRASE_ARRET_REFAIRE, PHRASE_ECRAN_ETEINT, PHRASE_LIGNE_INTROUVABLE, PHRASE_REFAITE, type Filtres } from "./regles";

export * from "./regles";

export const bibliothequeAllumee = () => interrupteurAllume(INTERRUPTEUR_LOTS);

export interface LigneBibliotheque {
  id: string;
  type_contenu: string;
  format: string | null;
  metier: string | null;
  metier_nom: string | null;
  reseaux: string[];
  etat: string;
  motif: string | null;
  le: Date;
}

const COLONNES = `l.id, l.type_contenu, l.format, l.metier, m.nom AS metier_nom, l.reseaux, l.etat, r.nom AS motif, l.modifie_le AS le`;
const JOINTURES = `FROM lot_ligne l LEFT JOIN metier m ON m.code = l.metier LEFT JOIN refus r ON r.code = l.refus`;

/** Lignes fabriquées ou publiées, non archivées. Aucune écriture. */
export async function listerBibliotheque(f: Filtres): Promise<LigneBibliotheque[]> {
  return requete<LigneBibliotheque>(
    `SELECT ${COLONNES} ${JOINTURES}
      WHERE l.etat = ANY($1) AND l.archive_le IS NULL
        AND ($2::text IS NULL OR l.metier = $2) AND ($3::text IS NULL OR $3 = ANY(l.reseaux)) AND ($4::text IS NULL OR l.type_contenu = $4)
      ORDER BY l.modifie_le DESC, l.id LIMIT $5`,
    [[...ETATS_BIBLIOTHEQUE], f.metier, f.reseau, f.type, MAX_LIGNES],
  );
}

/** Lignes refusées avec leur motif (table `refus`). Le tirage en garde la signature : le sujet n'est pas reproposé. */
export async function listerRefuses(): Promise<LigneBibliotheque[]> {
  return requete<LigneBibliotheque>(`SELECT ${COLONNES} ${JOINTURES} WHERE l.etat = 'refusee' AND l.archive_le IS NULL ORDER BY l.modifie_le DESC, l.id LIMIT $1`, [MAX_LIGNES]);
}

export type ResultatRefaire = { fait: boolean; message: string };

/** Le lot de reprises : un seul brouillon marqué `reglages.reprises`, créé au premier « Refaire ». */
async function lotDeReprises(): Promise<string> {
  await requete(`SELECT pg_advisory_xact_lock(hashtext('lot-de-reprises'))`);
  const [existant] = await requete<{ id: string }>(
    `SELECT id FROM lot WHERE etat = 'brouillon' AND archive_le IS NULL AND reglages ->> 'reprises' = 'true' ORDER BY numero LIMIT 1 FOR UPDATE`,
  );
  if (existant) return existant.id;
  const { id, numero } = await prochainLot();
  // Plafond symbolique : les lignes reprises ont un coût maximum nul, la dépense reste décidée à la commande.
  await requete(`INSERT INTO lot (id, numero, nombre, plafond_eur, reglages, etat) VALUES ($1, $2, 3, 0.01, '{"reprises": true}'::jsonb, 'brouillon')`, [id, numero]);
  return id;
}

/** « Refaire » : mêmes choix, nouvelle ligne à coller. Rien ne part si l'écran est éteint ou si « Tout arrêter » est allumé. */
export async function refaire(idLigne: string): Promise<ResultatRefaire> {
  if (!(await bibliothequeAllumee())) return { fait: false, message: PHRASE_ECRAN_ETEINT };
  if (!/^L[0-9]+-[0-9]+$/.test(idLigne)) return { fait: false, message: PHRASE_LIGNE_INTROUVABLE };
  const r = await sousArret("commande", () =>
    transaction(async (): Promise<ResultatRefaire> => {
      const [origine] = await requete<{ id: string }>(`SELECT id FROM lot_ligne WHERE id = $1 AND archive_le IS NULL AND etat = ANY($2)`, [idLigne, [...ETATS_REFAISABLES]]);
      if (!origine) return { fait: false, message: PHRASE_LIGNE_INTROUVABLE };
      const lot = await lotDeReprises();
      const [{ rang }] = await requete<{ rang: number }>(`SELECT coalesce(max(rang), 0) + 1 AS rang FROM lot_ligne WHERE lot = $1`, [lot]);
      const nouvelle = `${lot}-${rang}`;
      await requete(
        `INSERT INTO lot_ligne (id, lot, rang, type_contenu, format, public, metier, taille, service, douleur, cas_usage, sujet, actualite, accroche, structure, reseaux, fins, repere, etat)
         SELECT $2, $3, $4, type_contenu, format, public, metier, taille, service, douleur, cas_usage, sujet, actualite, accroche, structure, reseaux, fins, $5, 'a_coller'
           FROM lot_ligne WHERE id = $1`,
        [idLigne, nouvelle, lot, rang, `usine:${nouvelle}`],
      );
      await journaliser("lot", "Une vidéo a été remise à refaire.", { cible: nouvelle, donnees: { origine: idLigne } });
      return { fait: true, message: PHRASE_REFAITE };
    }),
  );
  return r.fait ? r.valeur : { fait: false, message: PHRASE_ARRET_REFAIRE };
}
