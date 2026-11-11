/**
 * Cartes de « Ma journée » : celles de la table `carte` (posées par les autres briques) et des cartes calculées.
 * Une carte dont l'interrupteur est éteint n'apparaît nulle part. Une carte = un verbe et un bouton.
 */
import "server-only";
import { depots, interrupteurAllume } from "@/donnees";
import { cartesDuCalendrier } from "@/calendrier";
import { requete } from "@/lib/base";

export interface CarteAffichee {
  /** `carte:<id>` (table) ou `calcul:<code>` (calculée). */
  cle: string;
  titre: string;
  detail: string | null;
  bouton: string;
  lien: string | null;
  urgence: number;
  echeance: Date | null;
  /** Id de la ligne de la table `carte` : permet « C'est fait » (absent pour une carte calculée). */
  id: string | null;
}

import { cartesDesChiffres } from "@/chiffres";

const URGENCE_CALCULEE = { aFaire: 60, nouveautes: 40, metiers: 30 } as const;

/** « 1 vidéo » / « 3 vidéos » : le nombre vient de la base, jamais d'un chiffre écrit à la main. */
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n === 1 ? un : plusieurs}`;

async function nombre(sql: string): Promise<number> {
  const [r] = await requete<{ n: string }>(sql);
  return Number(r?.n ?? 0);
}

async function cartesCalculees(): Promise<CarteAffichee[]> {
  const cartes: CarteAffichee[] = [];
  const base = { detail: null, echeance: null, id: null };

  if (await interrupteurAllume("ma-journee.a-faire-par-vous")) {
    const n = await nombre(`SELECT count(*) AS n FROM lot_ligne WHERE etat = 'a_coller' AND archive_le IS NULL`);
    if (n > 0)
      cartes.push({
        ...base,
        cle: "calcul:a-faire-par-vous",
        titre: `Coller ${pluriel(n, "vidéo prête", "vidéos prêtes")} dans le studio`,
        detail: "À faire par vous : le texte de chaque vidéo est prêt à être copié.",
        bouton: "Voir les lots",
        lien: "/lots",
        urgence: URGENCE_CALCULEE.aFaire,
      });
  }

  if (await interrupteurAllume("ma-journee.nouveautes")) {
    const n = await nombre(
      `SELECT count(*) AS n FROM actualite
       WHERE etat = 'propose' AND coalesce(retenue, '') = ''
         AND (perime_le IS NULL OR perime_le !~ '^\\d{4}-\\d{2}-\\d{2}$' OR perime_le >= to_char(current_date, 'YYYY-MM-DD'))`,
    );
    if (n > 0)
      cartes.push({
        ...base,
        cle: "calcul:nouveautes",
        titre: `Garder ou laisser ${pluriel(n, "nouveauté", "nouveautés")} de la semaine`,
        detail: "Gardez-en une ou deux : elles entrent au tirage.",
        bouton: "Choisir",
        lien: "/nouveautes",
        urgence: URGENCE_CALCULEE.nouveautes,
      });
  }

  if (await interrupteurAllume("ma-journee.metiers-sans-contenu")) {
    const n = await nombre(
      `SELECT count(*) AS n FROM metier m
       WHERE m.allume AND m.etat <> 'retire'
         AND NOT EXISTS (SELECT 1 FROM lot_ligne l WHERE l.metier = m.code AND l.archive_le IS NULL)`,
    );
    if (n > 0)
      cartes.push({
        ...base,
        cle: "calcul:metiers-sans-contenu",
        titre: `Commander un premier contenu pour ${pluriel(n, "métier allumé", "métiers allumés")}`,
        detail: "Ces métiers sont allumés mais n'ont encore aucun contenu.",
        bouton: "Voir les métiers",
        lien: "/metiers",
        urgence: URGENCE_CALCULEE.metiers,
      });
  }
  for (const c of await cartesDuCalendrier()) cartes.push({ ...base, ...c });
  return cartes;
}

async function cartesDeLaTable(): Promise<CarteAffichee[]> {
  const lignes = await depots.carte.lister({ ordre: "urgence", sens: "desc" });
  const visibles: CarteAffichee[] = [];
  for (const c of lignes) {
    if (c.fait_le) continue;
    if (c.interrupteur && !(await interrupteurAllume(c.interrupteur))) continue;
    visibles.push({ cle: `carte:${c.id}`, titre: c.titre, detail: c.detail, bouton: c.bouton, lien: c.lien, urgence: c.urgence, echeance: c.echeance, id: c.id });
  }
  return visibles;
}

/** Les cartes à montrer, les plus urgentes d'abord (à urgence égale, l'échéance la plus proche). */
export async function cartesDuJour(): Promise<CarteAffichee[]> {
  const toutes = [...(await cartesDeLaTable()), ...(await cartesCalculees()), ...(await cartesDesChiffres()).map((c) => ({ ...c, echeance: null, id: null }))];
  const echeance = (c: CarteAffichee) => (c.echeance ? new Date(c.echeance).getTime() : Infinity);
  return toutes.sort((a, b) => b.urgence - a.urgence || echeance(a) - echeance(b) || a.cle.localeCompare(b.cle));
}
