/**
 * Le tirage branché sur la base : `chargerTirage()` lit les bases, les réglages et l'historique par `src/donnees/` ;
 * `tirerDepuisLaBase()` lit l'interrupteur `tirage` (éteint par défaut) puis appelle `tirer()`.
 * Rien n'est écrit ici : l'enregistrement d'un lot (T09) range chaque ligne avec sa signature.
 */
import "server-only";
import { CODES_SERVICE, lireListe, type Reseau } from "@/contrats";
import { depots, interrupteurAllume, lireReglage } from "@/donnees";
import { requete } from "@/lib/base";
import { aUneSource, aujourdhuiParis, estPerimee } from "@/nouveautes";
import { formatsDuTirage } from "./formats";
import { tirer } from "./tirer";
import type { BasesTirage, HistoriqueTirage, ReglagesTirage, ResultatTirage } from "./types";

export const INTERRUPTEUR_TIRAGE = "tirage";
export const INTERRUPTEUR_FIN_RENDEZ_VOUS = "tirage.fin-rendez-vous";
/** Interrupteur du registre des mots (T04) : éteint, aucun mot n'est branché. */
const INTERRUPTEUR_MOTS = "mots";
export const REGLAGE_DELAI_CAS = "tirage.delai_cas_jours";
export const DELAI_CAS_DEFAUT = 30;
/** Réseaux cochés d'office : jamais TikTok ni LinkedIn (PLAN-MAITRE A.3 point 12). */
export const RESEAUX_PAR_DEFAUT: Reseau[] = ["instagram", "facebook", "youtube-shorts"];

function nombre(v: string | null | undefined, defaut: number): number {
  const n = Number.parseFloat((v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : defaut;
}

/**
 * Les bases du tirage. `metiersVoulus` (porte du studio) : ces métiers seulement, allumés ou non ;
 * sinon les métiers allumés.
 */
export async function chargerBases(metiersVoulus?: string[]): Promise<BasesTirage> {
  const metiers = metiersVoulus
    ? await requete<{ code: string; tailles_typiques: string | null }>(
        "SELECT code, tailles_typiques FROM metier WHERE code = ANY($1) AND etat = 'valide' ORDER BY code",
        [metiersVoulus],
      )
    : await requete<{ code: string; tailles_typiques: string | null }>(
        "SELECT code, tailles_typiques FROM metier WHERE allume AND etat = 'valide' ORDER BY code",
      );
  const codes = metiers.map((m) => m.code);
  const [tailles, services, douleurs, cas, accroches, appels, videos, autres, actualites, comptes] = await Promise.all([
    depots.taille.lister(),
    depots.service.lister({ ordre: "ordre" }),
    requete<BasesTirage["douleurs"][number]>("SELECT code, cible, services, tailles, type_contenu FROM douleur WHERE etat = 'valide' AND cible = ANY($1) ORDER BY code", [codes]),
    requete<BasesTirage["cas"][number]>(
      "SELECT code, cible, service, douleurs, phare, sujet, formats_conseilles FROM cas_usage WHERE etat = 'valide' AND cible = ANY($1) ORDER BY code",
      [codes],
    ),
    depots.accroche.lister(),
    depots.appel.lister({ ou: { etat: "valide" } }),
    depots.format_video.lister(),
    depots.format_autre.lister(),
    depots.actualite.lister({ ou: { retenue: "oui" } }),
    depots.compte.lister({ ou: { actif: true } }),
  ]);
  const jour = await aujourdhuiParis();
  const motsBranches = (await interrupteurAllume(INTERRUPTEUR_MOTS))
    ? (await depots.mot_branche.lister({ ou: { etat: "branche" } })).map((m) => ({ mot: m.mot, reseau: m.reseau as Reseau, compte: m.compte }))
    : [];
  const formats = formatsDuTirage(videos, autres);
  return {
    metiers,
    tailles: tailles.filter((t) => t.actif !== "non"),
    services: services.length ? services.filter((s) => s.etat !== "retire").map((s) => s.code) : [...CODES_SERVICE],
    douleurs,
    cas,
    accroches,
    appels,
    formats,
    actualites: actualites.filter((a) => aUneSource(a.source) && !estPerimee(a.perime_le, jour)),
    comptes: comptes.filter((c) => c.etat !== "retire").map((c) => ({ code: c.code, reseau: c.reseau, lien_profil: c.lien_profil })),
    motsBranches,
  };
}

/** Toutes les lignes déjà commandées (même refusées ou archivées) et tout ce qui a été fabriqué avant l'Usine. */
export async function chargerHistorique(): Promise<HistoriqueTirage> {
  const lignes = await requete<HistoriqueTirage["lignes"][number]>(
    `SELECT l.metier, l.taille, l.service, l.douleur, l.cas_usage, l.actualite, l.format, l.structure, l.accroche, l.fins, l.refus, l.signature,
            coalesce(o.commande_le, l.cree_le) AS le
       FROM lot_ligne l JOIN lot o ON o.id = l.lot ORDER BY le, l.id`,
  );
  const deja = await depots.deja_fabrique.lister({ inclureArchives: true });
  return {
    lignes,
    dejaFabrique: deja.map((d) => ({ signature: d.signature, cas_usage: d.cas_usage, format: d.format, le: new Date(d.fabrique_le) })),
  };
}

/** Réglages du tirage : ceux donnés par l'écran du lot, sinon les défauts (bases et `reglage`). */
export async function chargerReglages(bases: BasesTirage, donnes: Partial<ReglagesTirage> = {}): Promise<ReglagesTirage> {
  const enService = bases.formats.filter((f) => f.en_service && f.type_contenu === "video");
  const partsParDefaut = Object.fromEntries(enService.map((f) => [f.code, 100 / enService.length]));
  const reseaux = donnes.reseaux ?? RESEAUX_PAR_DEFAUT;
  const actualites = await depots.famille.lire("B");
  return {
    reseaux,
    poidsTailles: donnes.poidsTailles ?? Object.fromEntries(bases.tailles.map((t) => [t.code, nombre(t.poids, 1)])),
    poidsServices: donnes.poidsServices ?? {},
    partsFormats: donnes.partsFormats ?? Object.fromEntries(reseaux.map((r) => [r, partsParDefaut])),
    rythmeActualites: donnes.rythmeActualites ?? (actualites && actualites.etat !== "retire" ? nombre(lireListe(actualites.rythme_cible)[0], 1) : 0),
    delaiCasJours: donnes.delaiCasJours ?? Number(await lireReglage(REGLAGE_DELAI_CAS, DELAI_CAS_DEFAUT)),
    finRendezVous: await interrupteurAllume(INTERRUPTEUR_FIN_RENDEZ_VOUS),
    metiers: donnes.metiers,
    repetitionsPermises: donnes.repetitionsPermises,
    graine: donnes.graine,
    maintenant: donnes.maintenant,
  };
}

/** Le tirage complet ; éteint, il ne rend rien et le dit. */
export async function tirerDepuisLaBase(n: number, donnes: Partial<ReglagesTirage> = {}): Promise<ResultatTirage> {
  if (!(await interrupteurAllume(INTERRUPTEUR_TIRAGE))) {
    return { demandees: n, lignes: [], pourquoi: [{ metier: null, message: "Le tirage est éteint : allumez-le dans Réglages › Interrupteurs." }] };
  }
  const bases = await chargerBases();
  const [reglages, historique] = await Promise.all([chargerReglages(bases, donnes), chargerHistorique()]);
  return tirer(n, reglages, historique, bases);
}
