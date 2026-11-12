/** T11 · Calendrier simple : placement des contenus des lots selon les rythmes, lecture, changement de jour, cartes. */
import "server-only";
import { interrupteurAllume, journaliser } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import type { Reseau, TypeContenu } from "@/contrats";
import { lireReglagesTirage } from "@/reglages";
import { FORMATS_PART, type FormatPart } from "@/reglages/modele";
import {
  FENETRE_PARTS_JOURS,
  HEURE_PROPOSEE,
  INTERRUPTEUR_CALENDRIER,
  INTERRUPTEUR_CARTE_LINKEDIN,
  INTERRUPTEUR_CARTE_TROU,
  ajouterJours,
  ecartsDesParts,
  jourValide,
  lundiDe,
  repartir,
  trous,
  type APlacer,
} from "./regles";

export * from "./regles";

export class ErreurCalendrier extends Error {}

export const calendrierAllume = () => interrupteurAllume(INTERRUPTEUR_CALENDRIER);

const aujourdhui = async () =>
  (await requete<{ j: string }>(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS j`))[0].j;

const SQL_INSTANT = `(($1::date + time '${HEURE_PROPOSEE}') AT TIME ZONE 'Europe/Paris')`;

/** Prévu par réseau et par semaine (lundi), à partir de `depuis`. */
async function dejaPrevu(depuis: string) {
  const lignes = await requete<{ reseau: Reseau; lundi: string; n: string }>(
    `SELECT reseau, to_char(date_trunc('week', prevue_le AT TIME ZONE 'Europe/Paris'), 'YYYY-MM-DD') AS lundi, count(*) AS n
       FROM calendrier_ligne
      WHERE archive_le IS NULL AND etat <> 'echec' AND (prevue_le AT TIME ZONE 'Europe/Paris')::date >= $1::date
      GROUP BY 1, 2`,
    [lundiDe(depuis)],
  );
  const sortie: Partial<Record<Reseau, Record<string, number>>> = {};
  for (const l of lignes) (sortie[l.reseau] ??= {})[l.lundi] = Number(l.n);
  return sortie;
}

/**
 * Place dans le calendrier les contenus des lots commandés qui n'y sont pas encore, selon les rythmes de Réglages.
 * Rejouable sans doublon : un contenu déjà placé sur un réseau ne l'est jamais deux fois.
 * Renvoie le nombre de lignes ajoutées et les réseaux au repos (rythme 0) dont des contenus restent sans date.
 */
export async function placerLesNouveaux(): Promise<{ ajoutees: number; auRepos: Reseau[] }> {
  if (!(await calendrierAllume())) return { ajoutees: 0, auRepos: [] };
  const { rythmes } = await lireReglagesTirage();
  const depuis = ajouterJours(await aujourdhui(), 1);
  return transaction(async () => {
    await requete(`SELECT pg_advisory_xact_lock(hashtext('calendrier-placer'))`);
    const aPlacer = await requete<APlacer & { type_contenu: TypeContenu; format: string | null }>(
      `SELECT l.id AS ligne, r.reseau, l.type_contenu, l.format
         FROM lot_ligne l
         JOIN lot o ON o.id = l.lot
         CROSS JOIN LATERAL unnest(l.reseaux) AS r(reseau)
        WHERE o.etat = 'commande' AND o.archive_le IS NULL AND l.archive_le IS NULL AND l.etat <> 'refusee'
          AND NOT EXISTS (SELECT 1 FROM calendrier_ligne c WHERE c.lot_ligne = l.id AND c.reseau = r.reseau AND c.archive_le IS NULL)
        ORDER BY o.numero, l.rang, r.reseau`,
    );
    if (aPlacer.length === 0) return { ajoutees: 0, auRepos: [] };
    const { placements, sansPlace } = repartir(aPlacer, rythmes, await dejaPrevu(depuis), depuis);
    const infos = new Map(aPlacer.map((a) => [`${a.ligne}|${a.reseau}`, a]));
    for (const p of placements) {
      const a = infos.get(`${p.ligne}|${p.reseau}`)!;
      await requete(
        `INSERT INTO calendrier_ligne (lot_ligne, reseau, type_contenu, format, prevue_le) VALUES ($2, $3, $4, $5, ${SQL_INSTANT})`,
        [p.jour, p.ligne, p.reseau, a.type_contenu, a.format],
      );
    }
    if (placements.length) await journaliser("calendrier", `${placements.length} contenu(s) placé(s) dans le calendrier selon vos rythmes.`);
    return { ajoutees: placements.length, auRepos: [...new Set(sansPlace.map((s) => s.reseau))] };
  });
}

export interface LigneCalendrier {
  id: string;
  jour: string;
  reseau: Reseau;
  type_contenu: TypeContenu;
  etat: string;
  lot_ligne: string | null;
  metier: string | null;
}

/** Les lignes prévues de `depuis` à `jusqu'à` (inclus), dans l'ordre des jours. */
export async function lignesDuCalendrier(depuis: string, jusqua: string): Promise<LigneCalendrier[]> {
  return requete<LigneCalendrier>(
    `SELECT c.id::text, to_char(c.prevue_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS jour, c.reseau, c.type_contenu, c.etat, c.lot_ligne,
            coalesce(m.nom, l.metier) AS metier
       FROM calendrier_ligne c
       LEFT JOIN lot_ligne l ON l.id = c.lot_ligne
       LEFT JOIN metier m ON m.code = l.metier
      WHERE c.archive_le IS NULL AND (c.prevue_le AT TIME ZONE 'Europe/Paris')::date BETWEEN $1::date AND $2::date
      ORDER BY c.prevue_le, c.reseau, c.id`,
    [depuis, jusqua],
  );
}

/** Change le jour d'une ligne (l'heure proposée reste la même). */
export async function changerLeJour(id: string, jour: string): Promise<void> {
  if (!(await calendrierAllume())) throw new ErreurCalendrier("L'écran Calendrier est éteint : allumez-le dans Réglages › Interrupteurs.");
  if (!/^\d+$/.test(id)) throw new ErreurCalendrier("Ligne introuvable.");
  if (!jourValide(jour)) throw new ErreurCalendrier("Choisissez une date valide.");
  if (jour < (await aujourdhui())) throw new ErreurCalendrier("Ce jour est déjà passé : choisissez aujourd'hui ou un jour à venir.");
  const lignes = await requete(
    `UPDATE calendrier_ligne SET prevue_le = ${SQL_INSTANT}, modifie_le = now() WHERE id = $2 AND archive_le IS NULL RETURNING id`,
    [jour, id],
  );
  if (lignes.length === 0) throw new ErreurCalendrier("Ligne introuvable.");
  await journaliser("calendrier", `Contenu du calendrier déplacé au ${jour}.`, { cible: `calendrier_ligne:${id}` });
}

export interface RappelParts {
  reseau: Reseau;
  ecarts: ReturnType<typeof ecartsDesParts>;
}

/** Pour chaque réseau : part voulue par format contre part constatée sur les 30 derniers jours (prévu ou publié). */
export async function rappelDesParts(aujourd: string): Promise<RappelParts[]> {
  const { parts } = await lireReglagesTirage();
  const lignes = await requete<{ reseau: Reseau; type_contenu: TypeContenu; n: string }>(
    `SELECT reseau, type_contenu, count(*) AS n FROM calendrier_ligne
      WHERE archive_le IS NULL AND etat <> 'echec'
        AND (prevue_le AT TIME ZONE 'Europe/Paris')::date BETWEEN $1::date AND $2::date
      GROUP BY 1, 2`,
    [ajouterJours(aujourd, -FENETRE_PARTS_JOURS), aujourd],
  );
  const constates: Partial<Record<Reseau, Partial<Record<FormatPart, number>>>> = {};
  for (const l of lignes) if ((FORMATS_PART as readonly string[]).includes(l.type_contenu)) ((constates[l.reseau] ??= {})[l.type_contenu as FormatPart] = Number(l.n));
  return (Object.keys(parts) as Reseau[])
    .map((reseau) => ({ reseau, ecarts: ecartsDesParts(parts[reseau], constates[reseau] ?? {}) }))
    .filter((r) => r.ecarts.length > 0);
}

/** Trous de la semaine en cours et de la suivante. */
export async function trousAVenir(aujourd: string) {
  const { rythmes } = await lireReglagesTirage();
  const lundi = lundiDe(aujourd);
  return trous(rythmes, await dejaPrevu(lundi), [lundi, ajouterJours(lundi, 7)]);
}

export interface CarteCalendrier {
  cle: string;
  titre: string;
  detail: string | null;
  bouton: string;
  lien: string;
  urgence: number;
}

const URGENCE = { linkedin: 80, trou: 50 } as const;
const NOM_RESEAU: Record<Reseau, string> = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", "youtube-shorts": "YouTube Shorts" };

/** Cartes de « Ma journée » : un trou dans la semaine ; les commentaires LinkedIn dans l'heure qui suit une publication prévue. */
export async function cartesDuCalendrier(): Promise<CarteCalendrier[]> {
  const cartes: CarteCalendrier[] = [];
  if (!(await calendrierAllume())) return cartes;

  if (await interrupteurAllume(INTERRUPTEUR_CARTE_LINKEDIN)) {
    const [r] = await requete<{ n: string }>(
      `SELECT count(*) AS n FROM calendrier_ligne
        WHERE reseau = 'linkedin' AND archive_le IS NULL AND etat <> 'echec'
          AND prevue_le <= now() AND prevue_le > now() - interval '1 hour'`,
    );
    if (Number(r.n) > 0)
      cartes.push({
        cle: "calcul:commentaires-linkedin",
        titre: "Répondre aux commentaires de votre publication LinkedIn",
        detail: "Une publication LinkedIn était prévue il y a moins d'une heure : c'est le bon moment pour répondre.",
        bouton: "Commenter",
        lien: "/commenter",
        urgence: URGENCE.linkedin,
      });
  }

  if (await interrupteurAllume(INTERRUPTEUR_CARTE_TROU)) {
    const aujourd = await aujourdhui();
    const lundi = lundiDe(aujourd);
    const semaine = (await trousAVenir(aujourd)).filter((t) => t.lundi === lundi);
    if (semaine.length > 0)
      cartes.push({
        cle: "calcul:calendrier-trou",
        titre: `Il manque des publications cette semaine : ${semaine.map((t) => `${NOM_RESEAU[t.reseau]} (${t.manque})`).join(", ")}`,
        detail: "Commandez un lot ou déplacez un contenu pour combler le trou.",
        bouton: "Voir le calendrier",
        lien: "/calendrier",
        urgence: URGENCE.trou,
      });
  }
  return cartes;
}
