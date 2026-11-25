/**
 * Semaine proposée · tirage à la demande (docs/CONTRAT-PORTE.md). Sans IA, sans rien écrire, sans appel sortant : des lectures seulement.
 * Des créneaux « virtuels » (en mémoire) complètent les lignes déjà au calendrier, passent par `proposerSemaine()` (rythmes, quotas,
 * anti-répétition, écart de 90 minutes), puis UN tirage de la porte donne un sujet par créneau. Le compte ne sort jamais d'ici.
 * Stable : graine tirée du lundi, instant du tirage = minuit de Paris ; les créneaux passés ne sont retirés qu'à la sortie.
 */
import "server-only";
import { createHash } from "node:crypto";
import { estArrete } from "@/arret";
import { comptesActifs } from "@/calendrier/compte-actif";
import { ajouterJours, parSemaine } from "@/calendrier/regles";
import { RESEAUX_CARROUSEL, SEMAINE_CARROUSELS_MAX, SEMAINE_SUJETS_MAX, type LigneSemainePorte, type ReponseSemaine, type Reseau, type SujetPropose, type TypeContenu } from "@/contrats";
import { interrupteurAllume } from "@/donnees";
import { requete } from "@/lib/base";
import { ErreurPorte, phraseAucunFormat, tirerSujets } from "@/porte";
import { lireQuotas, lireReglagesTirage } from "@/reglages";
import type { QuotasParReseau } from "@/reglages/quotas";
import { LIBELLE_RESEAU, type RythmesParReseau } from "@/reglages/modele";
import { RESEAUX_PAR_DEFAUT } from "@/tirage/charger";
import { tirageTutorielEnCours } from "@/tutoriels";
import { INTERRUPTEUR_TUTORIEL, rythmesSansTutoriel } from "@/tutoriels/regles";
import { ECART_MINUTES, HEURES, SQL_LIGNES_SEMAINE, instantDeParis, isoParis, jourParis, lignesDeLaSemaine, proposerSemaine, type LigneBase, type LigneSemaine } from "./regles";

/** Interrupteur du plan #63 : éteint (par défaut), la semaine ne compte que des vidéos. */
export const INTERRUPTEUR_SEMAINE_CARROUSELS = "semaine.carrousels";

export const POURQUOI_PROPOSITION = "Un créneau libre qui respecte le rythme et les quantités du réseau.";

export const PHRASES = {
  arrete: "Tout est arrêté dans l'Usine : aucune semaine n'est proposée. Rallumez depuis « Tout arrêter » dans l'Usine.",
  aucun_metier_allume:
    "Aucun métier n'est allumé dans l'Usine : allumez au moins un métier dans « Mes métiers » (si l'écran est éteint : Réglages › Interrupteurs › Écran « Métiers »), puis redemandez la semaine.",
  metier_non_valide:
    "Un métier est allumé, mais aucun n'est validé : ouvrez sa fiche dans « Mes métiers », lisez-la, touchez « Valider ce métier », puis redemandez la semaine.",
  aucun_compte:
    "Aucun compte n'est actif pour ces réseaux. Réglages › Mes comptes : rendez actif un compte Instagram ou Facebook, puis redemandez la semaine.",
  aucun_sujet:
    "L'Usine n'a trouvé aucun sujet neuf pour cette semaine : ceux des métiers allumés sont déjà fabriqués ou retenus, ou il manque des cas d'usage dans les bases. Allumez un autre métier dans « Mes métiers », puis redemandez la semaine.",
  aucun_sujet_sans_fin: (reseaux: string) =>
    `L'Usine n'a trouvé aucun sujet neuf pour cette semaine : il manque, dans les bases, une phrase de fin pour ${reseaux}. Ajoutez-en une aux bases, puis redemandez la semaine.`,
  aucun_format: "Aucun format vidéo n'est en service dans les bases.",
  rythme_zero: "Tous vos réseaux sont au repos (rythme à zéro) : réglez un rythme dans Réglages.",
  reseau_non_propose: "YouTube n'est pas proposé pour l'instant : choisissez Instagram, Facebook, TikTok ou LinkedIn.",
  manque_tete: (n: number, sur: number) => `${n} proposition${n > 1 ? "s" : ""} sur ${sur} créneaux : `,
  manque_sujets: "l'Usine n'a pas trouvé assez de sujets neufs. Allumez d'autres métiers dans « Mes métiers » (et validez leur fiche) pour en recevoir davantage.",
  manque_fins: (reseaux: string) => `il manque, dans les bases, une phrase de fin pour ${reseaux}. Ajoutez-en aux bases, puis redemandez la semaine.`,
  cas_repete: "Ce cas d'usage revient déjà dans la semaine : il n'y en avait pas assez de différents.",
  semaine_pleine: "La semaine est déjà pleine selon vos rythmes : rien de plus à proposer.",
  semaine_passee: "Cette semaine est passée : choisissez une semaine à venir.",
  carrousel_format: "Aucun carrousel proposé : le format carrousel n'est pas en service dans les bases.",
  carrousel_fins: (reseaux: string) => `Aucun carrousel proposé pour ${reseaux} : il manque une phrase de fin pour les carrousels dans les bases.`,
  carrousel_sujets: "Aucun carrousel proposé : pas assez de sujets neufs.",
} as const;

/** Clé stable d'une proposition tirée d'une ligne du calendrier : la même semaine et la même ligne donnent la même clé. */
export const cleSemaine = (lundi: string, ligne: string) => createHash("sha256").update(`semaine | ${lundi} | ${ligne}`).digest("hex");

/** Clé d'une proposition tirée à la demande : la même semaine, le même réseau et le même sujet donnent la même clé. */
export const cleTirage = (lundi: string, reseau: string, signature: string) => createHash("sha256").update(`tirage | ${lundi} | ${reseau} | ${signature}`).digest("hex");

/** Graine de la semaine : la même pour deux demandes de la même semaine. */
export const graineDeLaSemaine = (lundi: string): number => Number.parseInt(createHash("sha256").update(`semaine | ${lundi}`).digest("hex").slice(0, 8), 16) & 0x7fffffff;

/** Minuit (heure de Paris) du jour de `maintenant` : l'instant du tirage, pour que les fenêtres d'anti-répétition restent les mêmes toute la journée. */
export const minuitParis = (maintenant: Date): Date => instantDeParis(jourParis(maintenant), "00:00");

/** Réseaux jamais proposés par la semaine tirée (YouTube est éteint pour l'instant). */
const RESEAUX_ECARTES: readonly string[] = ["youtube", "youtube-shorts"];

/**
 * Combien de carrousels ajouter par réseau : le quota carrousel du réseau (par semaine : la quantité ; par jour : la quantité × 7), borné à 7.
 * Zéro pour tout réseau hors `RESEAUX_CARROUSEL` (TikTok, YouTube). Pure.
 */
export function carrouselsParReseau(reseaux: readonly Reseau[], quotas: QuotasParReseau): Partial<Record<Reseau, number>> {
  const sortie: Partial<Record<Reseau, number>> = {};
  for (const r of reseaux) {
    if (!(RESEAUX_CARROUSEL as readonly string[]).includes(r)) {
      sortie[r] = 0;
      continue;
    }
    const q = quotas[r].carrousel;
    sortie[r] = Math.min(7, Math.max(0, q.periode === "jour" ? q.quantite * 7 : q.quantite));
  }
  return sortie;
}

/**
 * Les créneaux libres à remplir, en mémoire : autant que le rythme du réseau, vidéo, sur le compte actif ; puis `carrousels[réseau]` créneaux
 * carrousel (ids `v-<réseau>-c01…`, triés après les vidéos du réseau). Ids triés après les vraies lignes.
 */
export function lignesVirtuelles(reseaux: readonly Reseau[], rythmes: RythmesParReseau, comptes: Partial<Record<Reseau, string>>, carrousels: Partial<Record<Reseau, number>> = {}): LigneSemaine[] {
  const sortie: LigneSemaine[] = [];
  for (const reseau of reseaux) {
    const compte = comptes[reseau];
    if (!compte) continue;
    const n = parSemaine(rythmes[reseau]);
    for (let rang = 1; rang <= n; rang++) {
      sortie.push({ id: `v-${reseau}-${String(rang).padStart(2, "0")}`, reseau, compte, type_contenu: "video", instant: new Date(0), fixe: false });
    }
    for (let rang = 1; rang <= (carrousels[reseau] ?? 0); rang++) {
      sortie.push({ id: `v-${reseau}-c${String(rang).padStart(2, "0")}`, reseau, compte, type_contenu: "carrousel", instant: new Date(0), fixe: false });
    }
  }
  return sortie;
}

const jjmm = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;

/** Le titre du dernier contenu déjà fabriqué (ou seulement retenu) de la même famille de sujet : « « … », fabriqué le 12/11 » ou « retenu le 12/11 ». Absent si rien ne ressemble. */
export async function ressembleA(famille: string, lundi: string): Promise<string | undefined> {
  const [l] = await requete<{ titre: string | null; fabrique_le: Date; retenu: boolean }>(
    `SELECT coalesce(c.titre, s.titre) AS titre, d.fabrique_le, coalesce(d.note LIKE 'Retenu au studio%', false) AS retenu
       FROM deja_fabrique d
       LEFT JOIN cas_usage c ON c.code = d.cas_usage
       LEFT JOIN sujet s ON s.code = d.sujet
      WHERE (c.sujet = $1 OR d.sujet = $1) AND d.archive_le IS NULL
        AND (d.vise_le IS NULL OR d.vise_le NOT BETWEEN $2::date AND $3::date)
      ORDER BY d.fabrique_le DESC, d.id DESC LIMIT 1`,
    [famille, lundi, ajouterJours(lundi, 6)],
  );
  if (!l?.titre) return undefined;
  return `« ${l.titre} », ${l.retenu ? "retenu" : "fabriqué"} le ${jjmm(jourParis(new Date(l.fabrique_le)))}`;
}

const nommer = (rs: string[]) => rs.map((r) => (LIBELLE_RESEAU as Record<string, string>)[r] ?? r);

/** Le titre montré pour un sujet : celui du cas d'usage, sinon de la nouveauté, sinon du sujet. */
const titreDe = (s: SujetPropose): string | undefined => s.cas_usage?.titre ?? s.actualite?.titre ?? s.sujet?.titre ?? undefined;
/** Ce qui identifie « le même cas » : le titre montré (sans casse ni espaces en trop), sinon le code. */
const identiteDe = (s: SujetPropose): string => (titreDe(s) ?? s.cas_usage?.code ?? s.actualite?.code ?? s.sujet?.code ?? s.signature).trim().toLowerCase();

/**
 * Un sujet par créneau, dans l'ordre des créneaux. D'abord un cas d'usage (un titre) au plus une fois dans la semaine, tous réseaux confondus,
 * et seulement un sujet qui a une fin pour le réseau du créneau ; puis, s'il n'y en avait pas assez, les cas déjà vus (marqués `repete`).
 * Un créneau sans aucun sujet possible reste sans sujet. Rien de tiré ici : le choix ne dépend que de l'ordre.
 */
export function affecterSujets(creneaux: readonly { reseau: Reseau }[], sujets: readonly SujetPropose[], titresPris: Iterable<string> = []): { sujet: SujetPropose; repete: boolean; creneau: number }[] {
  const pris = new Set<number>();
  const titres = new Set<string>(titresPris);
  const sortie: ({ sujet: SujetPropose; repete: boolean } | undefined)[] = creneaux.map(() => undefined);
  const prendre = (i: number, unique: boolean) => {
    const k = sujets.findIndex((s, n) => !pris.has(n) && s.fins[creneaux[i].reseau] && (!unique || !titres.has(identiteDe(s))));
    if (k < 0) return;
    pris.add(k);
    sortie[i] = { sujet: sujets[k], repete: titres.has(identiteDe(sujets[k])) };
    titres.add(identiteDe(sujets[k]));
  };
  for (let i = 0; i < creneaux.length; i++) prendre(i, true);
  for (let i = 0; i < creneaux.length; i++) if (!sortie[i]) prendre(i, false);
  return sortie.flatMap((x, creneau) => (x ? [{ ...x, creneau }] : []));
}

interface Creneau {
  jour: string;
  reseau: Reseau;
  instant: Date;
  carrousel: boolean;
}

/**
 * La semaine proposée. `lundi` : un lundi déjà contrôlé ; `reseaux` : seulement ces réseaux (absent : Instagram et Facebook, les réseaux cochés d'office).
 * Lève `ErreurPorte(409, code, phrase)` quand il manque quelque chose. N'écrit rien.
 */
export async function tirerLaSemaine(lundi: string, reseaux: readonly Reseau[] | undefined, maintenant: Date): Promise<ReponseSemaine> {
  if (await estArrete()) throw new ErreurPorte(409, "arrete", PHRASES.arrete);
  const dimanche = ajouterJours(lundi, 6);
  if (dimanche < jourParis(maintenant)) throw new ErreurPorte(409, "semaine_passee", PHRASES.semaine_passee);

  const demandees = (reseaux ?? RESEAUX_PAR_DEFAUT).filter((r) => !RESEAUX_ECARTES.includes(r));
  if (!demandees.length) throw new ErreurPorte(409, "rythme_zero", PHRASES.reseau_non_propose);
  const [{ rythmes }, quotas] = await Promise.all([lireReglagesTirage(), lireQuotas()]);
  const actifs = demandees.filter((r) => parSemaine(rythmes[r]) > 0);
  if (!actifs.length) throw new ErreurPorte(409, "rythme_zero", PHRASES.rythme_zero);

  // Le tirage ne prend que les métiers allumés ET validés (src/tirage/charger.ts) : le contrôle compte les mêmes.
  const [{ allumes, valides }] = await requete<{ allumes: number; valides: number }>(
    "SELECT count(*)::int AS allumes, (count(*) FILTER (WHERE etat = 'valide'))::int AS valides FROM metier WHERE allume AND etat <> 'retire'",
  );
  if (!allumes) throw new ErreurPorte(409, "aucun_metier_allume", PHRASES.aucun_metier_allume);
  if (!valides) throw new ErreurPorte(409, "aucun_metier_allume", PHRASES.metier_non_valide);

  const comptes = await comptesActifs();
  const avecCompte = actifs.filter((r) => comptes[r]);
  if (!avecCompte.length) throw new ErreurPorte(409, "aucun_compte", PHRASES.aucun_compte);
  const sansCompte = actifs.filter((r) => !comptes[r]);
  const message = sansCompte.length ? `${nommer(sansCompte).join(", ")} ${sansCompte.length > 1 ? "ne sont pas proposés" : "n'est pas proposé"} : aucun compte actif.` : undefined;

  // L'instant du tirage est minuit de Paris : la grille et les sujets ne bougent pas pendant la journée.
  const minuit = minuitParis(maintenant);
  const lignes = await requete<LigneBase>(SQL_LIGNES_SEMAINE, [lundi, dimanche]);
  const reelles = lignesDeLaSemaine(lignes).filter((l) => demandees.includes(l.reseau));
  // Premier appel : exactement le chemin d'avant (vidéos seules, rythmes d'origine), qu'il y ait des carrousels ou non.
  // Réserve de tutoriels : tant qu'un tutoriel de cette semaine est pris au Studio sans créneau posé, une place vidéo de son réseau reste libre (créneaux virtuels seulement ; éteint : rien ne change).
  const tutorielEnCours = (await interrupteurAllume(INTERRUPTEUR_TUTORIEL)) && (await tirageTutorielEnCours(lundi));
  const virtuelles = lignesVirtuelles(avecCompte, tutorielEnCours ? rythmesSansTutoriel(rythmes) : rythmes, comptes);
  const { propositions: propositionsVideo } = proposerSemaine({ lignes: [...reelles, ...virtuelles], lundi, rythmes, quotas, occupes: [], maintenant: minuit, etaler: true });
  // Carrousels (plan #63) : éteint, rien ne change. Allumé, un SECOND appel pose K créneaux carrousel en plus ; les vidéos et lignes du premier appel y sont des lignes fixes, donc elles ne bougent pas.
  const carrouselsAllumes = await interrupteurAllume(INTERRUPTEUR_SEMAINE_CARROUSELS);
  const parReseau = carrouselsAllumes ? carrouselsParReseau(avecCompte, quotas) : {};
  const reseauxCarrousel = avecCompte.filter((r) => (parReseau[r] ?? 0) > 0);
  let propositionsCarrousel: typeof propositionsVideo = [];
  if (reseauxCarrousel.length) {
    const rythmesCarrousel: RythmesParReseau = { ...rythmes };
    for (const r of reseauxCarrousel) rythmesCarrousel[r] = { min: rythmes[r].min + (parReseau[r] ?? 0), max: rythmes[r].max + (parReseau[r] ?? 0) };
    const fixes: LigneSemaine[] = [
      ...reelles.filter((l) => l.fixe),
      ...propositionsVideo.map((p) => ({ id: p.ligne, reseau: p.reseau, compte: p.compte, type_contenu: p.type_contenu, instant: p.instant, fixe: true })),
    ];
    const carrouselsVirtuels = lignesVirtuelles(reseauxCarrousel, rythmes, comptes, parReseau).filter((v) => v.type_contenu === "carrousel");
    propositionsCarrousel = proposerSemaine({ lignes: [...fixes, ...carrouselsVirtuels], lundi, rythmes: rythmesCarrousel, quotas, occupes: [], maintenant: minuit, etaler: true }).propositions.filter((p) => p.type_contenu === "carrousel");
  }
  const propositions = [...propositionsVideo, ...propositionsCarrousel];
  const dePassage = new Set([...virtuelles.map((v) => v.id), ...propositionsCarrousel.map((p) => p.ligne)]);
  const idsCarrousel = new Set(propositionsCarrousel.map((p) => p.ligne));

  // Instants déjà pris par réseau (lignes fixes et propositions) : un créneau d'aujourd'hui déjà passé est reporté à une heure libre d'aujourd'hui.
  const occupes = new Map<string, Date[]>();
  const poser = (r: string, d: Date) => occupes.set(r, [...(occupes.get(r) ?? []), d]);
  for (const l of reelles) if (l.fixe) poser(l.reseau, l.instant);
  for (const p of propositionsVideo) poser(p.reseau, p.instant);
  const aujourdhui = jourParis(maintenant);
  const libre = (r: string, instant: Date, sauf: Date) => !(occupes.get(r) ?? []).some((d) => d.getTime() !== sauf.getTime() && Math.abs(d.getTime() - instant.getTime()) < ECART_MINUTES * 60_000);

  // Les créneaux tirés (virtuels), jamais déjà passés, triés par (heure, réseau) : le sujet de rang i va au créneau i.
  // Les vidéos d'abord (comme avant, sans voir les carrousels), puis les carrousels, qui respectent l'écart de 90 minutes avec tout ce qui est posé (vidéos reportées comprises).
  const grille = propositions.filter((p) => dePassage.has(p.ligne));
  const grilleOrdonnee = [...grille.filter((p) => !idsCarrousel.has(p.ligne)), ...grille.filter((p) => idsCarrousel.has(p.ligne))];
  const tousCreneaux: Creneau[] = [];
  for (const p of grilleOrdonnee) {
    let instant = p.instant;
    let reporte = false;
    if (instant.getTime() <= maintenant.getTime() && p.jour === aujourdhui) {
      const h = HEURES.find((x) => instantDeParis(aujourdhui, x).getTime() > maintenant.getTime() && libre(p.reseau, instantDeParis(aujourdhui, x), p.instant));
      if (!h) continue;
      instant = instantDeParis(aujourdhui, h);
      poser(p.reseau, instant);
      reporte = true;
    }
    if (instant.getTime() <= maintenant.getTime()) continue;
    if (idsCarrousel.has(p.ligne) && !reporte) {
      if (!libre(p.reseau, instant, new Date(0))) {
        const h = p.jour === aujourdhui ? HEURES.find((x) => instantDeParis(aujourdhui, x).getTime() > maintenant.getTime() && libre(p.reseau, instantDeParis(aujourdhui, x), new Date(0))) : undefined;
        if (!h) continue;
        instant = instantDeParis(aujourdhui, h);
      }
      poser(p.reseau, instant);
    }
    tousCreneaux.push({ jour: p.jour, reseau: p.reseau, instant, carrousel: idsCarrousel.has(p.ligne) });
  }
  const parHeure = (a: Creneau, b: Creneau) => a.instant.getTime() - b.instant.getTime() || a.reseau.localeCompare(b.reseau);
  const creneaux = tousCreneaux.filter((c) => !c.carrousel).sort(parHeure);
  creneaux.splice(SEMAINE_SUJETS_MAX);
  const creneauxCarrousel = tousCreneaux.filter((c) => c.carrousel).sort(parHeure);
  creneauxCarrousel.splice(SEMAINE_CARROUSELS_MAX);

  // Lignes déjà au calendrier (déplaçables) : comme avant, sans sujet.
  const deCalendrier: LigneSemainePorte[] = propositions
    .filter((p) => !dePassage.has(p.ligne) && p.instant.getTime() > maintenant.getTime())
    .map((p) => ({ cle: cleSemaine(lundi, p.ligne), jour: p.jour, reseau: p.reseau, type: p.type_contenu as TypeContenu, heure: isoParis(p.instant).slice(11, 16), pourquoi: POURQUOI_PROPOSITION }));

  // Sujets déjà retenus pour cette semaine : ils restent hors de l'historique (le tirage garde sa suite) ; leur créneau (même jour et réseau, sinon le dernier du réseau) est retiré.
  const retenus = await requete<{ signature: string; vise_le: string; vise_reseau: Reseau; type_contenu: string }>(
    `SELECT signature, vise_le::text, vise_reseau, type_contenu FROM deja_fabrique WHERE archive_le IS NULL AND vise_le BETWEEN $1::date AND $2::date AND vise_reseau IS NOT NULL ORDER BY id`,
    [lundi, dimanche],
  );

  let sujets: SujetPropose[] = [];
  if (creneaux.length) {
    // On tire plus de sujets que de créneaux : un même cas d'usage ne passe qu'une fois dans la semaine, et chaque créneau veut un sujet qui a une fin sur son réseau.
    const r = await tirerSujets(
      { n: Math.min(creneaux.length * 3, 60), type_contenu: "video", reseaux: avecCompte, graine: graineDeLaSemaine(lundi) },
      { maintenant: minuit, ecarter: retenus.map((x) => x.signature) },
    );
    sujets = r.lignes;
    if (!sujets.length) {
      const raison = r.pourquoi.map((x) => x.message);
      if (raison[0] === phraseAucunFormat("video")) throw new ErreurPorte(409, "aucun_format", PHRASES.aucun_format);
      if (raison.some((m) => m.startsWith("Aucune fin possible"))) throw new ErreurPorte(409, "aucun_sujet", PHRASES.aucun_sujet_sans_fin(nommer(avecCompte).join(", ")));
      throw new ErreurPorte(409, "aucun_sujet", PHRASES.aucun_sujet);
    }
  }

  // Créneaux déjà pris par un sujet retenu : retirés, sans toucher aux autres. Le sujet retenu lui-même n'est pas reproposé (ni son cas d'usage).
  // Allumé, un carrousel retenu retire un créneau carrousel, jamais une vidéo ; une vidéo retenue, un créneau vidéo.
  const retirer = (liste: readonly Creneau[], deCeType: readonly (typeof retenus)[number][]) => {
    const pris = new Set<number>();
    for (const x of deCeType) {
      let i = liste.findIndex((c, k) => !pris.has(k) && c.reseau === x.vise_reseau && c.jour === x.vise_le);
      if (i < 0) for (let k = liste.length - 1; k >= 0; k--) if (!pris.has(k) && liste[k].reseau === x.vise_reseau) { i = k; break; }
      if (i >= 0) pris.add(i);
    }
    return pris;
  };
  const estCarrousel = (x: (typeof retenus)[number]) => carrouselsAllumes && x.type_contenu === "carrousel";
  const pris = retirer(creneaux, retenus.filter((x) => !estCarrousel(x)));
  const dejaRetenues = new Set(retenus.map((x) => x.signature));
  const restants = creneaux.filter((_, k) => !pris.has(k));
  const titresRetenus = sujets.filter((s) => dejaRetenues.has(s.signature)).map(identiteDe);
  const libres = sujets.filter((s) => !dejaRetenues.has(s.signature));
  const placements = affecterSujets(restants, libres, titresRetenus);

  // Second tirage (carrousels), seulement allumé : jamais de 409, un message à la place.
  const prisCarrousel = retirer(creneauxCarrousel, retenus.filter(estCarrousel));
  const restantsCarrousel = creneauxCarrousel.filter((_, k) => !prisCarrousel.has(k));
  let sujetsCarrousel: SujetPropose[] = [];
  let formatCarrouselAbsent = false;
  let finCarrouselManquante = false;
  if (creneauxCarrousel.length) {
    try {
      const total = reseauxCarrousel.reduce((n, r) => n + (parReseau[r] ?? 0), 0);
      const rc = await tirerSujets(
        { n: Math.min(total * 3, 60), type_contenu: "carrousel", reseaux: reseauxCarrousel, graine: graineDeLaSemaine(lundi) ^ 1 },
        { maintenant: minuit, ecarter: retenus.map((x) => x.signature) },
      );
      sujetsCarrousel = rc.lignes;
      formatCarrouselAbsent = !rc.lignes.length && rc.pourquoi[0]?.message === phraseAucunFormat("carrousel");
      finCarrouselManquante = !rc.lignes.length && rc.pourquoi.some((x) => x.message.startsWith("Aucune fin possible"));
    } catch (e) {
      if (!(e instanceof ErreurPorte)) throw e;
    }
  }
  const libresCarrousel = sujetsCarrousel.filter((s) => !dejaRetenues.has(s.signature));

  const familles = new Map<string, Promise<string | undefined>>();
  const tirees: LigneSemainePorte[] = [];
  for (const { sujet: s, repete, creneau } of placements) {
    const c = restants[creneau];
    const famille = s.sujet?.code;
    if (famille && !familles.has(famille)) familles.set(famille, ressembleA(famille, lundi));
    const ressemble = famille ? await familles.get(famille) : undefined;
    const libelle = s.metier?.libelle ?? s.metier?.code;
    tirees.push({
      cle: cleTirage(lundi, c.reseau, s.signature),
      jour: c.jour,
      reseau: c.reseau,
      type: "video",
      heure: isoParis(c.instant).slice(11, 16),
      titre: titreDe(s),
      pourquoi: `${libelle ? `${libelle} · ` : ""}Un créneau libre qui respecte votre rythme (${parSemaine(rythmes[c.reseau])} par semaine).${repete ? ` ${PHRASES.cas_repete}` : ""}`,
      ...(ressemble ? { ressemble_a: ressemble } : {}),
      sujet: s,
    });
  }

  const toutes = [...deCalendrier, ...tirees];
  // Carrousels : un même cas d'usage n'est pas pris deux fois dans la semaine, tous types confondus (sinon `repete`, comme les vidéos).
  const titresDejaPris = [...titresRetenus, ...placements.map((x) => identiteDe(x.sujet))];
  const placementsCarrousel = affecterSujets(restantsCarrousel, libresCarrousel, titresDejaPris);
  const tireesCarrousel: LigneSemainePorte[] = [];
  for (const { sujet: s, repete, creneau } of placementsCarrousel) {
    const c = restantsCarrousel[creneau];
    const libelle = s.metier?.libelle ?? s.metier?.code;
    tireesCarrousel.push({
      cle: cleTirage(lundi, c.reseau, s.signature),
      jour: c.jour,
      reseau: c.reseau,
      type: "carrousel",
      heure: isoParis(c.instant).slice(11, 16),
      titre: titreDe(s),
      pourquoi: `${libelle ? `${libelle} · ` : ""}Un carrousel dans la semaine (${parReseau[c.reseau] ?? 0} par semaine).${repete ? ` ${PHRASES.cas_repete}` : ""}`,
      sujet: s,
    });
  }
  const semaineVide = () => {
    if (!creneaux.length && grille.length) return new ErreurPorte(409, "semaine_passee", PHRASES.semaine_passee);
    if (restants.length) return new ErreurPorte(409, "aucun_sujet", libres.length ? PHRASES.aucun_sujet_sans_fin(nommer(avecCompte).join(", ")) : PHRASES.aucun_sujet);
    return new ErreurPorte(409, "semaine_pleine", PHRASES.semaine_pleine);
  };
  // Jamais de créneau abandonné en silence : s'il en reste sans sujet, la réponse le dit, avec le geste à faire.
  // La vraie raison, réseau par réseau : un créneau resté vide sur un réseau sans phrase de fin manque de fin, pas de sujets.
  const posees = new Set(placements.map((x) => x.creneau));
  const videsParReseau = restants.filter((_, k) => !posees.has(k)).map((c) => c.reseau);
  const sansFin = [...new Set(videsParReseau)].filter((r) => !libres.some((s) => s.fins[r]));
  const sansSujet = videsParReseau.some((r) => !sansFin.includes(r));
  const raisons = [...(sansFin.length ? [PHRASES.manque_fins(nommer(sansFin).join(", "))] : []), ...(sansSujet ? [PHRASES.manque_sujets] : [])];
  const manque = restants.length > tirees.length && raisons.length ? PHRASES.manque_tete(toutes.length + tireesCarrousel.length, deCalendrier.length + restants.length + restantsCarrousel.length) + raisons.join(" Par ailleurs, ") : undefined;

  // Allumé, des carrousels rendus suffisent à ne pas répondre « semaine pleine » (409 seulement s'il n'en sort aucun).
  if (!toutes.length && !tireesCarrousel.length) throw semaineVide();
  const posesCarrousel = new Set(placementsCarrousel.map((x) => x.creneau));
  const videsCarrousel = restantsCarrousel.filter((_, k) => !posesCarrousel.has(k)).map((c) => c.reseau);
  const carrouselsSansFin = [...new Set(videsCarrousel)].filter((r) => !libresCarrousel.some((s) => s.fins[r]));
  const messagesCarrousel: string[] = [];
  if (formatCarrouselAbsent) messagesCarrousel.push(PHRASES.carrousel_format);
  else if (videsCarrousel.length && !libresCarrousel.length && !finCarrouselManquante) messagesCarrousel.push(PHRASES.carrousel_sujets);
  else if (videsCarrousel.length) {
    if (carrouselsSansFin.length) messagesCarrousel.push(PHRASES.carrousel_fins(nommer(carrouselsSansFin).join(", ")));
    if (!tireesCarrousel.length && carrouselsSansFin.length < new Set(videsCarrousel).size) messagesCarrousel.push(PHRASES.carrousel_sujets);
  }
  const messages = [message, manque, ...messagesCarrousel].filter((m): m is string => Boolean(m));
  return { propositions: [...toutes, ...tireesCarrousel], ...(messages.length ? { message: messages.join(" ") } : {}) };
}
