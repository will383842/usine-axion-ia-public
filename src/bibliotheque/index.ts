/**
 * UO-03 · bibliothèque (fabriqué ou publié), « Refusés » et « Refaire ».
 * Lecture seule sauf `refaire()` : un lot brouillon dont l'aperçu porte la reprise ; la ligne d'origine n'est jamais modifiée. « Tout arrêter » (U-ARRET, via U-COMMANDE) bloque « Refaire ».
 */
import "server-only";
import { sousArret } from "@/arret";
import { interrupteurAllume, journaliser, prochainLot } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { COUT_MAX_LIGNE_DEFAUT_EUR, INTERRUPTEUR_LOTS } from "@/lots/regles";
import type { LigneTiree } from "@/tirage";
import { ETATS_BIBLIOTHEQUE, ETATS_REFAISABLES, MAX_LIGNES, PHRASE_ARRET_REFAIRE, PHRASE_DEJA_REFAITE, PHRASE_ECRAN_ETEINT, PHRASE_LIGNE_INTROUVABLE, PHRASE_REFAITE, type Filtres } from "./regles";

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

interface Origine {
  type_contenu: LigneTiree["type_contenu"];
  format: string | null;
  metier: string | null;
  taille: string | null;
  service: string | null;
  douleur: string | null;
  cas_usage: string | null;
  sujet: string | null;
  actualite: string | null;
  accroche: string | null;
  structure: string | null;
  reseaux: LigneTiree["reseaux"];
  fins: LigneTiree["fins"];
  signature: string | null;
  nombre: number;
  plafond_eur: string;
  reglages: Record<string, unknown>;
}

/**
 * « Refaire » : mêmes choix, rangés comme ligne d'APERÇU d'un lot brouillon (aucune ligne de lot écrite) ; le parcours de l'écran Lots
 * (relire, commander avec plafond, métiers allumés et signatures, ou archiver) s'applique ensuite. Le plafond, le nombre et le coût maximum
 * sont ceux du lot d'origine. Rien ne part si l'écran est éteint ou si « Tout arrêter » est allumé.
 * Rejouable : une origine déjà en reprise non commandée n'en crée pas une deuxième.
 */
export async function refaire(idLigne: string): Promise<ResultatRefaire> {
  if (!(await bibliothequeAllumee())) return { fait: false, message: PHRASE_ECRAN_ETEINT };
  if (!/^L[0-9]+-[0-9]+$/.test(idLigne)) return { fait: false, message: PHRASE_LIGNE_INTROUVABLE };
  const r = await sousArret("commande", () =>
    transaction(async (): Promise<ResultatRefaire> => {
      await requete(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`reprise:${idLigne}`]);
      const [origine] = await requete<Origine>(
        `SELECT l.type_contenu, l.format, l.metier, l.taille, l.service, l.douleur, l.cas_usage, l.sujet, l.actualite, l.accroche, l.structure, l.reseaux, l.fins, l.signature,
                o.nombre, o.plafond_eur, o.reglages
           FROM lot_ligne l JOIN lot o ON o.id = l.lot
          WHERE l.id = $1 AND l.archive_le IS NULL AND l.etat = ANY($2)`,
        [idLigne, [...ETATS_REFAISABLES]],
      );
      if (!origine) return { fait: false, message: PHRASE_LIGNE_INTROUVABLE };
      const [enCours] = await requete<{ id: string }>(
        `SELECT id FROM lot WHERE etat = 'brouillon' AND archive_le IS NULL AND reglages ->> 'reprise_de' = $1 LIMIT 1`,
        [idLigne],
      );
      if (enCours) return { fait: false, message: PHRASE_DEJA_REFAITE };

      // Signature propre à la reprise : l'unicité en base interdit de redonner celle de l'origine.
      const [{ n }] = await requete<{ n: number }>(`SELECT count(*)::int AS n FROM lot_ligne WHERE starts_with(signature, $1)`, [`${origine.signature ?? idLigne}|reprise-`]);
      const sig = `${origine.signature ?? idLigne}|reprise-${n + 1}`;
      const { apercu: _apercu, ...reglagesOrigine } = origine.reglages as { apercu?: unknown } & Record<string, unknown>;
      void _apercu;
      const ligne: LigneTiree = {
        rang: 1,
        type_contenu: origine.type_contenu,
        format: origine.format as string,
        public: "public.clients",
        metier: origine.metier,
        taille: origine.taille,
        service: origine.service,
        douleur: origine.douleur,
        cas_usage: origine.cas_usage,
        sujet: origine.sujet,
        actualite: origine.actualite,
        accroche: origine.accroche as string,
        structure: origine.structure as string,
        reseaux: origine.reseaux,
        fins: origine.fins,
        mots: {},
        signature: sig,
      };
      const reglages = {
        ...reglagesOrigine,
        coutMaxLigneEur: typeof reglagesOrigine.coutMaxLigneEur === "number" ? reglagesOrigine.coutMaxLigneEur : COUT_MAX_LIGNE_DEFAUT_EUR,
        reprise_de: idLigne,
        apercu: { lignes: [ligne], pourquoi: [], ecartees: origine.signature ? [origine.signature] : [] },
      };
      const { id, numero } = await prochainLot();
      await requete(`INSERT INTO lot (id, numero, nombre, plafond_eur, reglages, etat) VALUES ($1, $2, $3, $4, $5::jsonb, 'brouillon')`, [
        id,
        numero,
        origine.nombre,
        origine.plafond_eur,
        JSON.stringify(reglages),
      ]);
      await journaliser("lot", "Une vidéo a été remise à refaire.", { cible: id, donnees: { origine: idLigne } });
      return { fait: true, message: PHRASE_REFAITE };
    }),
  );
  return r.fait ? r.valeur : { fait: false, message: PHRASE_ARRET_REFAIRE };
}
