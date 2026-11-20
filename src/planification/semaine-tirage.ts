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
import { SEMAINE_SUJETS_MAX, type LigneSemainePorte, type ReponseSemaine, type Reseau, type SujetPropose, type TypeContenu } from "@/contrats";
import { requete } from "@/lib/base";
import { ErreurPorte, phraseAucunFormat, tirerSujets } from "@/porte";
import { lireQuotas, lireReglagesTirage } from "@/reglages";
import { LIBELLE_RESEAU, type RythmesParReseau } from "@/reglages/modele";
import { RESEAUX_PAR_DEFAUT } from "@/tirage/charger";
import { SQL_LIGNES_SEMAINE, instantDeParis, isoParis, jourParis, lignesDeLaSemaine, proposerSemaine, type LigneBase, type LigneSemaine } from "./regles";

export const POURQUOI_PROPOSITION = "Un créneau libre qui respecte le rythme et les quantités du réseau.";

export const PHRASES = {
  arrete: "Tout est arrêté dans l'Usine : aucune semaine n'est proposée. Rallumez depuis « Tout arrêter » dans l'Usine.",
  aucun_metier_allume:
    "Aucun métier n'est allumé dans l'Usine : allumez au moins un métier dans « Mes métiers » (si l'écran est éteint : Réglages › Interrupteurs › Écran « Métiers »), puis redemandez la semaine.",
  aucun_compte: "Aucun compte actif pour ces réseaux dans les bases : ajoutez un compte Instagram ou Facebook aux bases, puis redemandez la semaine.",
  aucun_sujet: "L'Usine n'a trouvé aucun sujet neuf pour cette semaine : ",
  aucun_format: "Aucun format vidéo n'est en service dans les bases.",
  rythme_zero: "Tous vos réseaux sont au repos (rythme à zéro) : réglez un rythme dans Réglages.",
  semaine_pleine: "La semaine est déjà pleine selon vos rythmes : rien de plus à proposer.",
  semaine_passee: "Cette semaine est passée : choisissez une semaine à venir.",
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

/** Les créneaux libres à remplir, en mémoire : autant que le rythme du réseau, vidéo, sur le compte actif. Ids triés après les vraies lignes. */
export function lignesVirtuelles(reseaux: readonly Reseau[], rythmes: RythmesParReseau, comptes: Partial<Record<Reseau, string>>): LigneSemaine[] {
  const sortie: LigneSemaine[] = [];
  for (const reseau of reseaux) {
    const compte = comptes[reseau];
    if (!compte) continue;
    const n = parSemaine(rythmes[reseau]);
    for (let rang = 1; rang <= n; rang++) {
      sortie.push({ id: `v-${reseau}-${String(rang).padStart(2, "0")}`, reseau, compte, type_contenu: "video", instant: new Date(0), fixe: false });
    }
  }
  return sortie;
}

const jjmm = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;

/** Le titre du dernier contenu déjà fabriqué de la même famille de sujet : « « … », fabriqué le 12/11 ». Absent si rien ne ressemble. */
export async function ressembleA(famille: string, lundi: string): Promise<string | undefined> {
  const [l] = await requete<{ titre: string | null; fabrique_le: Date }>(
    `SELECT coalesce(c.titre, s.titre) AS titre, d.fabrique_le
       FROM deja_fabrique d
       LEFT JOIN cas_usage c ON c.code = d.cas_usage
       LEFT JOIN sujet s ON s.code = d.sujet
      WHERE (c.sujet = $1 OR d.sujet = $1) AND d.archive_le IS NULL
        AND (d.vise_le IS NULL OR d.vise_le NOT BETWEEN $2::date AND $3::date)
      ORDER BY d.fabrique_le DESC, d.id DESC LIMIT 1`,
    [famille, lundi, ajouterJours(lundi, 6)],
  );
  if (!l?.titre) return undefined;
  return `« ${l.titre} », fabriqué le ${jjmm(jourParis(new Date(l.fabrique_le)))}`;
}

const nommer = (rs: string[]) => rs.map((r) => (LIBELLE_RESEAU as Record<string, string>)[r] ?? r);

interface Creneau {
  jour: string;
  reseau: Reseau;
  instant: Date;
}

/**
 * La semaine proposée. `lundi` : un lundi déjà contrôlé ; `reseaux` : seulement ces réseaux (absent : Instagram et Facebook, les réseaux cochés d'office).
 * Lève `ErreurPorte(409, code, phrase)` quand il manque quelque chose. N'écrit rien.
 */
export async function tirerLaSemaine(lundi: string, reseaux: readonly Reseau[] | undefined, maintenant: Date): Promise<ReponseSemaine> {
  if (await estArrete()) throw new ErreurPorte(409, "arrete", PHRASES.arrete);
  const dimanche = ajouterJours(lundi, 6);
  if (dimanche < jourParis(maintenant)) throw new ErreurPorte(409, "semaine_passee", PHRASES.semaine_passee);

  const demandes = (reseaux ?? RESEAUX_PAR_DEFAUT).filter((r) => !RESEAUX_ECARTES.includes(r));
  const [{ rythmes }, quotas] = await Promise.all([lireReglagesTirage(), lireQuotas()]);
  const actifs = demandes.filter((r) => parSemaine(rythmes[r]) > 0);
  if (!actifs.length) throw new ErreurPorte(409, "rythme_zero", PHRASES.rythme_zero);

  const [{ n: metiers }] = await requete<{ n: number }>("SELECT count(*)::int AS n FROM metier WHERE allume AND etat <> 'retire'");
  if (!metiers) throw new ErreurPorte(409, "aucun_metier_allume", PHRASES.aucun_metier_allume);

  const comptes = await comptesActifs();
  const avecCompte = actifs.filter((r) => comptes[r]);
  if (!avecCompte.length) throw new ErreurPorte(409, "aucun_compte", PHRASES.aucun_compte);
  const sansCompte = actifs.filter((r) => !comptes[r]);
  const message = sansCompte.length ? `${nommer(sansCompte).join(", ")} ${sansCompte.length > 1 ? "ne sont pas proposés" : "n'est pas proposé"} : aucun compte actif.` : undefined;

  // L'instant du tirage est minuit de Paris : la grille et les sujets ne bougent pas pendant la journée.
  const minuit = minuitParis(maintenant);
  const lignes = await requete<LigneBase>(SQL_LIGNES_SEMAINE, [lundi, dimanche]);
  const reelles = lignesDeLaSemaine(lignes).filter((l) => !reseaux || reseaux.includes(l.reseau));
  const virtuelles = lignesVirtuelles(avecCompte, rythmes, comptes);
  const { propositions } = proposerSemaine({ lundi, lignes: [...reelles, ...virtuelles], rythmes, quotas, occupes: [], maintenant: minuit });
  const dePassage = new Set(virtuelles.map((v) => v.id));

  // Les créneaux tirés (virtuels), triés par (jour, heure, réseau) : le sujet de rang i va au créneau i.
  const creneaux: Creneau[] = propositions
    .filter((p) => dePassage.has(p.ligne))
    .map((p) => ({ jour: p.jour, reseau: p.reseau, instant: p.instant }))
    .sort((a, b) => a.instant.getTime() - b.instant.getTime() || a.reseau.localeCompare(b.reseau))
    .slice(0, SEMAINE_SUJETS_MAX);

  // Lignes déjà au calendrier (déplaçables) : comme avant, sans sujet.
  const deCalendrier: LigneSemainePorte[] = propositions
    .filter((p) => !dePassage.has(p.ligne) && p.instant.getTime() > maintenant.getTime())
    .map((p) => ({ cle: cleSemaine(lundi, p.ligne), jour: p.jour, reseau: p.reseau, type: p.type_contenu as TypeContenu, heure: isoParis(p.instant).slice(11, 16), pourquoi: POURQUOI_PROPOSITION }));

  // Sujets déjà retenus pour cette semaine : ils restent hors de l'historique (le tirage garde sa suite), leur créneau est retiré à la sortie.
  const retenus = await requete<{ signature: string; vise_le: string; vise_reseau: Reseau }>(
    `SELECT signature, vise_le::text, vise_reseau FROM deja_fabrique WHERE archive_le IS NULL AND vise_le BETWEEN $1::date AND $2::date AND vise_reseau IS NOT NULL ORDER BY id`,
    [lundi, dimanche],
  );

  let sujets: SujetPropose[] = [];
  if (creneaux.length) {
    const r = await tirerSujets(
      { n: creneaux.length, type_contenu: "video", reseaux: avecCompte, graine: graineDeLaSemaine(lundi) },
      { maintenant: minuit, ecarter: retenus.map((x) => x.signature) },
    );
    sujets = r.lignes;
    if (!sujets.length) {
      const raison = r.pourquoi[0]?.message ?? "";
      if (raison === phraseAucunFormat("video")) throw new ErreurPorte(409, "aucun_format", PHRASES.aucun_format);
      throw new ErreurPorte(409, "aucun_sujet", `${PHRASES.aucun_sujet}${raison}`.trim());
    }
  }

  // À la sortie seulement : créneaux passés, créneaux sans sujet, créneaux déjà retenus.
  const pris = new Set<number>();
  for (const x of retenus) {
    let i = creneaux.findIndex((c, k) => !pris.has(k) && c.reseau === x.vise_reseau && c.jour === x.vise_le);
    if (i < 0) for (let k = creneaux.length - 1; k >= 0; k--) if (!pris.has(k) && creneaux[k].reseau === x.vise_reseau) { i = k; break; }
    if (i >= 0) pris.add(i);
  }
  const dejaRetenues = new Set(retenus.map((x) => x.signature));
  const familles = new Map<string, Promise<string | undefined>>();
  const tirees: LigneSemainePorte[] = [];
  for (const [i, c] of creneaux.entries()) {
    const s = sujets[i];
    if (!s || pris.has(i) || c.instant.getTime() <= maintenant.getTime() || dejaRetenues.has(s.signature)) continue;
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
      titre: s.cas_usage?.titre ?? s.actualite?.titre ?? s.sujet?.titre ?? undefined,
      pourquoi: `${libelle ? `${libelle} · ` : ""}Un créneau libre qui respecte votre rythme (${parSemaine(rythmes[c.reseau])} par semaine).`,
      ...(ressemble ? { ressemble_a: ressemble } : {}),
      sujet: s,
    });
  }

  const toutes = [...deCalendrier, ...tirees];
  if (!toutes.length) {
    const toutesPassees = creneaux.length > 0 && creneaux.every((c) => c.instant.getTime() <= maintenant.getTime());
    if (toutesPassees) throw new ErreurPorte(409, "semaine_passee", PHRASES.semaine_passee);
    throw new ErreurPorte(409, "semaine_pleine", PHRASES.semaine_pleine);
  }
  return { propositions: toutes, ...(message ? { message } : {}) };
}
