/**
 * `tirer(n, reglages, historique, bases)` (T08) : choisit n contenus pour un lot, sans lire la base.
 * Choix pondéré pas à pas : métier allumé → taille → service → cas (les cas phares d'abord) → douleur → format
 * (selon les parts du réseau) → famille d'accroche ; la famille « Actualités » à son rythme ; fin par réseau
 * (fins.ts). Public Clients seulement.
 * Jamais deux fois une signature déjà commandée ou déjà fabriquée (une part « - » d'un déjà fabriqué vaut toute valeur) ; un même cas ne revient dans un autre format
 * qu'après le délai réglé ; jamais deux fois de suite le même métier, la même taille ou la même structure ;
 * 40 % au plus d'une structure. Les refus pèsent : `hors_cible` divise par deux le poids du métier,
 * `faux_ou_douteux` et `deja_vu` écartent le cas, `accroche_faible` écarte l'accroche, `image` et
 * `voix_ou_rythme` divisent par deux le poids du format.
 * Quand il ne reste pas assez de combinaisons neuves, rend moins de lignes et dit pourquoi, par métier.
 */
import { lireListe, type Reseau, type TypeContenu } from "@/contrats";
import { choisirFin, compterFin, FENETRE_FINS_JOURS, typesDeContenu, type Appel, type CompteFins } from "./fins";
import { signature } from "./signature";
import type { BasesTirage, HistoriqueTirage, LigneTiree, ReglagesTirage, ResultatTirage } from "./types";

const JOUR = 86_400_000;
export const PART_MAX_STRUCTURE = 0.4;
/** Familles d'accroche jamais tirées pour le public Clients ; « actualité » est réservée aux nouveautés. */
const FAMILLE_ACTUALITE = "actualité";
const FAMILLES_HORS_CLIENTS = new Set(["recrutement"]);

interface Combinaison {
  metier: string | null;
  taille: string | null;
  service: string | null;
  douleur: string | null;
  cas_usage: string | null;
  phare: boolean;
  sujet: string | null;
  actualite: string | null;
  format: string;
  type_contenu: TypeContenu;
  structure: string;
  accroches: string[];
  signature: string;
}

/** Hasard reproductible (mulberry32). */
export function hasardDepuis(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function choisirPondere<K>(poids: Map<K, number>, hasard: () => number): K | undefined {
  const entrees = [...poids].filter(([, p]) => p > 0);
  const total = entrees.reduce((s, [, p]) => s + p, 0);
  if (!total) return undefined;
  let x = hasard() * total;
  for (const [k, p] of entrees) {
    x -= p;
    if (x < 0) return k;
  }
  return entrees[entrees.length - 1][0];
}

function poidsDe(table: Record<string, number>, cle: string | null): number {
  if (cle === null) return 1;
  const p = table[cle];
  return typeof p === "number" && Number.isFinite(p) ? Math.max(0, p) : 1;
}

function grouper<K>(liste: readonly Combinaison[], cle: (c: Combinaison) => K, poids: (k: K) => number): Map<K, number> {
  const m = new Map<K, number>();
  for (const c of liste) if (!m.has(cle(c))) m.set(cle(c), poids(cle(c)));
  return m;
}

export function tirer(n: number, reglages: ReglagesTirage, historique: HistoriqueTirage, bases: BasesTirage): ResultatTirage {
  const demandees = Math.max(0, Math.floor(n));
  const maintenant = (reglages.maintenant ?? new Date()).getTime();
  const hasard = hasardDepuis(reglages.graine ?? maintenant);
  const delai = Math.max(0, reglages.delaiCasJours) * JOUR;

  // Mémoire : signatures prises, cas par format, refus, compte des fins sur 7 jours, ligne précédente.
  const prises = new Set<string>();
  const casFormats = new Map<string, { format: string | null; le: number }[]>();
  const noterCas = (cas: string | null, format: string | null, le: number) => {
    if (cas) casFormats.set(cas, [...(casFormats.get(cas) ?? []), { format, le }]);
  };
  const casEcartes = new Set<string>();
  const accrochesEcartees = new Set<string>();
  const refusMetier = new Map<string, number>();
  const refusFormat = new Map<string, number>();
  const comptesFins = new Map<Reseau, CompteFins>();
  const compteDe = (r: Reseau) => comptesFins.get(r) ?? (comptesFins.set(r, { total: 0, mot: 0, enregistrerOuPartager: 0 }), comptesFins.get(r)!);
  const appelsParCode = new Map(bases.appels.map((a) => [a.code, a]));
  let actualitesRecentes = 0;

  const passees = [...historique.lignes].sort((a, b) => a.le.getTime() - b.le.getTime());
  for (const l of passees) {
    prises.add(l.signature ?? signature(l));
    noterCas(l.cas_usage, l.format, l.le.getTime());
    if (l.refus === "faux_ou_douteux" || l.refus === "deja_vu") if (l.cas_usage) casEcartes.add(l.cas_usage);
    if (l.refus === "accroche_faible" && l.accroche) accrochesEcartees.add(l.accroche);
    if (l.refus === "hors_cible" && l.metier) refusMetier.set(l.metier, (refusMetier.get(l.metier) ?? 0) + 1);
    if ((l.refus === "image" || l.refus === "voix_ou_rythme") && l.format) refusFormat.set(l.format, (refusFormat.get(l.format) ?? 0) + 1);
    if (maintenant - l.le.getTime() < FENETRE_FINS_JOURS * JOUR) {
      if (l.actualite) actualitesRecentes += 1;
      for (const [r, code] of Object.entries(l.fins) as [Reseau, string][]) compterFin(compteDe(r), appelsParCode.get(code));
    }
  }
  for (const d of historique.dejaFabrique) {
    prises.add(d.signature);
    noterCas(d.cas_usage, d.format, d.le.getTime());
  }
  const derniere = passees[passees.length - 1];
  let precedent: Pick<Combinaison, "metier" | "taille" | "structure"> | null = derniere
    ? { metier: derniere.metier, taille: derniere.taille, structure: derniere.structure ?? "" }
    : null;

  // Formats en service, leur poids (somme des parts sur les réseaux du lot) et leurs réseaux.
  const reseauxDuFormat = new Map<string, Reseau[]>();
  const poidsFormat = new Map<string, number>();
  for (const f of bases.formats.filter((x) => x.en_service)) {
    const reseaux = reglages.reseaux.filter((r) => (reglages.partsFormats[r]?.[f.code] ?? 0) > 0);
    const somme = reseaux.reduce((s, r) => s + (reglages.partsFormats[r]?.[f.code] ?? 0), 0);
    if (!reseaux.length) continue;
    reseauxDuFormat.set(f.code, reseaux);
    poidsFormat.set(f.code, somme * 0.5 ** (refusFormat.get(f.code) ?? 0));
  }
  const formats = bases.formats.filter((f) => reseauxDuFormat.has(f.code));

  // Accroches par famille et par type de contenu.
  const accrochesPour = (type: TypeContenu, actualite: boolean) => {
    const m = new Map<string, string[]>();
    for (const a of bases.accroches) {
      const famille = (a.famille ?? "").trim();
      if (!famille || accrochesEcartees.has(a.code) || FAMILLES_HORS_CLIENTS.has(famille)) continue;
      if ((famille === FAMILLE_ACTUALITE) !== actualite) continue;
      const types = typesDeContenu(a.types_contenu);
      if (types.length && !types.includes(type)) continue;
      m.set(famille, [...(m.get(famille) ?? []), a.code]);
    }
    return m;
  };

  // Toutes les combinaisons permises (métiers allumés, poids non nuls).
  const combinaisons: Combinaison[] = [];
  const ajouter = (c: Omit<Combinaison, "structure" | "accroches" | "signature">) => {
    for (const [structure, accroches] of accrochesPour(c.type_contenu, c.actualite !== null)) {
      combinaisons.push({ ...c, structure, accroches, signature: signature({ ...c, structure }) });
    }
  };
  const voulus = reglages.metiers ? new Set(reglages.metiers) : null;
  const metiers = bases.metiers.filter((m) => !voulus || voulus.has(m.code));
  const codesTailles = bases.tailles.map((t) => t.code).filter((t) => poidsDe(reglages.poidsTailles, t) > 0);
  const services = bases.services.filter((s) => poidsDe(reglages.poidsServices, s) > 0);
  for (const m of metiers) {
    const typiques = lireListe(m.tailles_typiques);
    const tailles = codesTailles.filter((t) => !typiques.length || typiques.includes(t));
    const douleursDuMetier = bases.douleurs.filter((d) => d.cible === m.code);
    for (const service of services) {
      for (const cas of bases.cas.filter((c) => c.cible === m.code && c.service === service && !casEcartes.has(c.code))) {
        const phare = Boolean(cas.phare?.trim()) || cas.code.includes(".phare.");
        const liees = lireListe(cas.douleurs);
        const formatsConseilles = typesDeContenu(cas.formats_conseilles);
        for (const taille of tailles) {
          // Douleurs reliées au cas, sinon celles du métier pour ce service ; aucune : le cas part sans douleur.
          const reliees = douleursDuMetier.filter((d) => (liees.length ? liees.includes(d.code) : lireListe(d.services).includes(service)));
          const douleurs = reliees.filter((d) => {
            const dt = lireListe(d.tailles).length ? lireListe(d.tailles) : typiques;
            return !dt.length || dt.includes(taille);
          });
          for (const douleur of reliees.length ? douleurs : [null]) {
            for (const f of formats) {
              if (formatsConseilles.length && !formatsConseilles.includes(f.type_contenu) && !formatsConseilles.includes(f.code)) continue;
              const dtc = douleur ? typesDeContenu(douleur.type_contenu) : [];
              if (dtc.length && !dtc.includes(f.type_contenu)) continue;
              ajouter({ metier: m.code, taille, service, douleur: douleur?.code ?? null, cas_usage: cas.code, phare, sujet: cas.sujet || null, actualite: null, format: f.code, type_contenu: f.type_contenu });
            }
          }
        }
      }
    }
  }
  const aujourdhui = new Date(maintenant).toISOString().slice(0, 10);
  for (const a of bases.actualites) {
    if (a.perime_le && a.perime_le < aujourdhui) continue;
    for (const f of formats) {
      ajouter({ metier: null, taille: null, service: null, douleur: null, cas_usage: null, phare: false, sujet: null, actualite: a.code, format: f.code, type_contenu: f.type_contenu });
    }
  }

  // Déjà fabriqué saisi en partie (taille, douleur ou famille d'accroche inconnues, « - ») : la part inconnue
  // vaut n'importe quelle valeur, pour que la vidéo faite avant l'Usine ne soit pas refaite.
  const motifs = historique.dejaFabrique.map((d) => d.signature.split("|")).filter((m) => m.length === 7 && m.includes("-"));
  if (motifs.length) {
    for (const c of combinaisons) {
      const parts = c.signature.split("|");
      if (motifs.some((m) => m.every((x, i) => x === "-" || x === parts[i]))) prises.add(c.signature);
    }
  }

  // Tirage ligne par ligne.
  const plafondStructure = Math.max(1, Math.floor(PART_MAX_STRUCTURE * demandees));
  const parStructure = new Map<string, number>();
  const sansFin = new Set<string>();
  const actualitesVoulues = Math.max(0, Math.floor(reglages.rythmeActualites) - actualitesRecentes);
  let actualitesTirees = 0;
  const lignes: LigneTiree[] = [];

  const neuve = (c: Combinaison) => {
    if (prises.has(c.signature) || sansFin.has(c.signature)) return false;
    if (c.cas_usage) for (const p of casFormats.get(c.cas_usage) ?? []) if (p.format !== c.format && maintenant - p.le < delai) return false;
    return true;
  };
  const repetitions = new Set(reglages.repetitionsPermises ?? []);
  const variee = (c: Combinaison) => {
    if (precedent) {
      if (c.metier && c.metier === precedent.metier && !repetitions.has("metier")) return false;
      if (c.taille && c.taille === precedent.taille && !repetitions.has("taille")) return false;
      if (c.structure === precedent.structure) return false;
    }
    return (parStructure.get(c.structure) ?? 0) < plafondStructure;
  };

  while (lignes.length < demandees) {
    const possibles = combinaisons.filter((c) => neuve(c) && variee(c));
    const actus = possibles.filter((c) => c.actualite);
    const autres = possibles.filter((c) => !c.actualite);
    const restantes = demandees - lignes.length;
    const resteActus = actualitesVoulues - actualitesTirees;
    let liste = autres;
    if (resteActus > 0 && actus.length && (!autres.length || hasard() < resteActus / restantes)) liste = actus;
    if (!liste.length) break;

    // Choix pas à pas, pondéré.
    if (liste === autres) {
      const metier = choisirPondere(grouper(liste, (c) => c.metier, (k) => 0.5 ** (refusMetier.get(k ?? "") ?? 0)), hasard);
      liste = liste.filter((c) => c.metier === metier);
      const taille = choisirPondere(grouper(liste, (c) => c.taille, (k) => poidsDe(reglages.poidsTailles, k)), hasard);
      liste = liste.filter((c) => c.taille === taille);
      const service = choisirPondere(grouper(liste, (c) => c.service, (k) => poidsDe(reglages.poidsServices, k)), hasard);
      liste = liste.filter((c) => c.service === service);
      if (liste.some((c) => c.phare)) liste = liste.filter((c) => c.phare);
      const cas = choisirPondere(grouper(liste, (c) => c.cas_usage, () => 1), hasard);
      liste = liste.filter((c) => c.cas_usage === cas);
      const douleur = choisirPondere(grouper(liste, (c) => c.douleur, () => 1), hasard);
      liste = liste.filter((c) => c.douleur === douleur);
    } else {
      const actualite = choisirPondere(grouper(liste, (c) => c.actualite, () => 1), hasard);
      liste = liste.filter((c) => c.actualite === actualite);
    }
    const format = choisirPondere(grouper(liste, (c) => c.format, (k) => poidsFormat.get(k) ?? 0), hasard);
    liste = liste.filter((c) => c.format === format);
    const structure = choisirPondere(grouper(liste, (c) => c.structure, () => 1), hasard);
    const choisie = liste.find((c) => c.structure === structure);
    if (!choisie) break;

    // Fin par réseau ; un réseau sans fin possible est laissé de côté ; aucune fin : la combinaison est écartée.
    const fins: Partial<Record<Reseau, string>> = {};
    const mots: Partial<Record<Reseau, string>> = {};
    for (const r of reseauxDuFormat.get(choisie.format) ?? []) {
      const fin = choisirFin(bases.appels, { reseau: r, typeContenu: choisie.type_contenu, comptes: bases.comptes, motsBranches: bases.motsBranches, finRendezVous: reglages.finRendezVous, compte: compteDe(r) }, hasard);
      if (!fin) continue;
      fins[r] = fin.appel;
      if (fin.mot) mots[r] = fin.mot;
    }
    const reseaux = Object.keys(fins) as Reseau[];
    if (!reseaux.length) {
      sansFin.add(choisie.signature);
      continue;
    }
    for (const r of reseaux) compterFin(compteDe(r), appelsParCode.get(fins[r]!) as Appel | undefined);

    lignes.push({
      rang: lignes.length + 1,
      type_contenu: choisie.type_contenu,
      format: choisie.format,
      public: "public.clients",
      metier: choisie.metier,
      taille: choisie.taille,
      service: choisie.service,
      douleur: choisie.douleur,
      cas_usage: choisie.cas_usage,
      sujet: choisie.sujet,
      actualite: choisie.actualite,
      accroche: choisie.accroches[Math.floor(hasard() * choisie.accroches.length)],
      structure: choisie.structure,
      reseaux,
      fins,
      mots,
      signature: choisie.signature,
    });
    prises.add(choisie.signature);
    noterCas(choisie.cas_usage, choisie.format, maintenant);
    parStructure.set(choisie.structure, (parStructure.get(choisie.structure) ?? 0) + 1);
    if (choisie.actualite) actualitesTirees += 1;
    precedent = choisie;
  }

  return { demandees, lignes, pourquoi: lignes.length < demandees ? expliquer(metiers.map((m) => m.code), combinaisons, neuve, demandees - lignes.length) : [] };
}

/** Pourquoi le tirage rend moins de lignes, par métier. */
function expliquer(metiers: string[], combinaisons: readonly Combinaison[], neuve: (c: Combinaison) => boolean, manque: number) {
  const pourquoi: ResultatTirage["pourquoi"] = [];
  if (!metiers.length) return [{ metier: null, message: "Aucun métier allumé : allumez au moins un métier dans l'écran « Métiers »." }];
  for (const metier of metiers) {
    const siennes = combinaisons.filter((c) => c.metier === metier);
    const neuves = siennes.filter(neuve).length;
    if (!siennes.length) pourquoi.push({ metier, message: "Aucune combinaison possible : pas de cas d'usage pour ses tailles, ses services et les formats en service." });
    else if (!neuves) pourquoi.push({ metier, message: `Plus aucune combinaison neuve : les ${siennes.length} possibles sont déjà commandées, déjà fabriquées ou attendent le délai du cas.` });
    else pourquoi.push({ metier, message: `${neuves} combinaison(s) neuve(s), mais la variété du lot (jamais deux fois de suite le même métier, la même taille ou la même structure ; 40 % au plus d'une structure) ne permet pas d'en placer davantage.` });
  }
  pourquoi.push({ metier: null, message: `${manque} ligne(s) manquante(s) : allumez d'autres métiers, ou demandez un lot plus petit.` });
  return pourquoi;
}
