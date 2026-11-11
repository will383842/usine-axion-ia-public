/** Calculs de l'écran « Métiers » : points à trancher et avancement (purs, sans accès à la base). */

export const INTERRUPTEUR_METIERS = "metiers";

/** Seuil du bloc « Points à trancher » : un métier avec deux cas phares sourcés au plus. */
export const CAS_SOURCES_MINIMUM = 2;

export interface DouleurFiche {
  code: string;
  dite: string | null;
  services: string | null;
  calcule: string | null;
}
export interface CasFiche {
  code: string;
  titre: string | null;
  service: string | null;
  phare: string | null;
  source: string | null;
  calcule: string | null;
}
export interface MetierFiche {
  profondeur: string | null;
  calcule: string | null;
}

export interface PointATrancher {
  cle: string;
  texte: string;
  /** Éléments concernés (dites, titres), pour les montrer à Will. */
  details: string[];
}

const plein = (v: string | null | undefined) => (v ?? "").trim().length > 0;
const liste = (v: string | null | undefined) => (v ?? "").split(";").map((s) => s.trim()).filter(Boolean);

export const estPhare = (c: CasFiche) => plein(c.phare);

/** Champs remplis par calcul (jamais relus), regroupés avec le nombre de fiches concernées. */
export function champsCalcules(metier: MetierFiche, douleurs: DouleurFiche[], cas: CasFiche[]) {
  const groupes: { objet: string; champs: string[]; nombre: number }[] = [];
  const metierChamps = liste(metier.calcule);
  if (metierChamps.length) groupes.push({ objet: "La fiche du métier", champs: metierChamps, nombre: 1 });
  for (const [objet, lignes] of [["Douleurs", douleurs], ["Cas d'usage", cas]] as const) {
    const concernees = lignes.filter((l) => liste(l.calcule).length);
    if (concernees.length) {
      groupes.push({ objet, champs: [...new Set(concernees.flatMap((l) => liste(l.calcule)))], nombre: concernees.length });
    }
  }
  return groupes;
}

export function pointsATrancher(metier: MetierFiche, douleurs: DouleurFiche[], cas: CasFiche[]): PointATrancher[] {
  const points: PointATrancher[] = [];
  if (metier.profondeur && metier.profondeur !== "complete") {
    points.push({ cle: "profondeur", texte: "La fiche du métier est peu approfondie.", details: [] });
  }
  const sansService = douleurs.filter((d) => !plein(d.services));
  if (sansService.length) {
    points.push({
      cle: "douleurs-sans-service",
      texte: `${sansService.length} douleur${sansService.length > 1 ? "s" : ""} sans service relié.`,
      details: sansService.map((d) => d.dite || d.code),
    });
  }
  const phares = cas.filter(estPhare);
  const pharesSansSource = phares.filter((c) => !plein(c.source));
  if (pharesSansSource.length) {
    points.push({
      cle: "phares-sans-source",
      texte: `${pharesSansSource.length} cas phare${pharesSansSource.length > 1 ? "s" : ""} sans source.`,
      details: pharesSansSource.map((c) => c.titre || c.code),
    });
  }
  const sources = phares.length - pharesSansSource.length;
  if (sources <= CAS_SOURCES_MINIMUM) {
    points.push({
      cle: "peu-de-cas-sources",
      texte: `Seulement ${sources} cas phare${sources > 1 ? "s" : ""} avec source (deux au plus : à compléter avant d'aller loin).`,
      details: [],
    });
  }
  return points;
}

export interface Avancement {
  cases: number;
  publiees: number;
}

/** Cases = cas d'usage ; une case est faite quand un contenu publié part de ce cas. */
export function avancementParService(cas: CasFiche[], casPublies: ReadonlySet<string>): Map<string, Avancement> {
  const parService = new Map<string, Avancement>();
  for (const c of cas) {
    const cle = c.service ?? "";
    const a = parService.get(cle) ?? { cases: 0, publiees: 0 };
    a.cases += 1;
    if (casPublies.has(c.code)) a.publiees += 1;
    parService.set(cle, a);
  }
  return parService;
}

export const pourcent = (a: Avancement) => (a.cases ? Math.round((a.publiees / a.cases) * 100) : 0);
