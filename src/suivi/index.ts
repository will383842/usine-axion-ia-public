/**
 * UO-04 · lectures des écrans de suivi. LECTURE SEULE, sauf `changerSurLeSite` (la case « Sur le site »).
 * Aucun nom, e-mail ni téléphone : seulement des nombres et des dates.
 */
import "server-only";
import { ajouterJours } from "@/chiffres/regles";
import { interrupteurAllume, journaliser } from "@/donnees";
import { lireAgregats } from "@/agregats";
import { jourUtcDe } from "@/agregats/regles";
import { requete } from "@/lib/base";
import { alertesDeVeille, cartesDeVeille, lireEntrees, veilleAllumee, type CarteVeille } from "@/veille";
import { ETATS_LIGNE, INTERRUPTEUR_SUIVI, totauxParReseau, type EtatLigne, type TotalReseau } from "./regles";

export * from "./regles";

export const suiviAllume = () => interrupteurAllume(INTERRUPTEUR_SUIVI);

const JOURS_PROSPECTS = 7;

export interface SourceFiabilite {
  code: string;
  libelle: string;
  dernier: Date | null;
}
export interface Fiabilite {
  veilleAllumee: boolean;
  alertes: CarteVeille[];
  sources: SourceFiabilite[];
}

/** Alertes de silence (U-VEILLE, sans écrire le fichier du cockpit) et date du dernier relevé de chaque source. */
export async function lireFiabilite(maintenant: Date = new Date()): Promise<Fiabilite> {
  const allumee = await veilleAllumee();
  const alertes = allumee ? cartesDeVeille(alertesDeVeille(await lireEntrees(), maintenant)) : [];
  const [r] = await requete<{ studio: Date | null; chiffres: Date | null; releves: Date | null }>(
    `SELECT (SELECT max(envoyee_le) FROM commande_studio WHERE archive_le IS NULL) AS studio,
            (SELECT max(genere_le) FROM agregat_crm) AS chiffres,
            (SELECT max(saisi_le) FROM releve_mot_historique) AS releves`,
  );
  return {
    veilleAllumee: allumee,
    alertes,
    sources: [
      { code: "studio", libelle: "Propositions envoyées au Studio", dernier: r?.studio ?? null },
      { code: "chiffres", libelle: "Chiffres des demandes de guides", dernier: r?.chiffres ?? null },
      { code: "releves", libelle: "Chiffres saisis chaque semaine", dernier: r?.releves ?? null },
    ],
  };
}

/** Lignes de lot qui ne sont pas des vidéos, comptées par état (les cinq états, même à zéro). */
export async function lireFormatsSansVideo(): Promise<{ etat: EtatLigne; nombre: number }[]> {
  const lignes = await requete<{ etat: EtatLigne; n: string }>(
    `SELECT etat, count(*) AS n FROM lot_ligne WHERE type_contenu <> 'video' AND archive_le IS NULL GROUP BY etat`,
  );
  return ETATS_LIGNE.map((e) => ({ etat: e.code, nombre: Number(lignes.find((l) => l.etat === e.code)?.n ?? 0) }));
}

export interface VideoSite {
  id: string;
  format: string | null;
  etat: EtatLigne;
  surLeSite: boolean;
  retireLe: Date | null;
}

/** Les vidéos des lots (les plus récentes d'abord), avec leur case « Sur le site ». */
export async function lireVideosSurLeSite(): Promise<VideoSite[]> {
  const lignes = await requete<{ id: string; format: string | null; etat: EtatLigne; sur_le_site: boolean; sur_le_site_retire_le: Date | null }>(
    `SELECT l.id, l.format, l.etat, l.sur_le_site, l.sur_le_site_retire_le
       FROM lot_ligne l JOIN lot o ON o.id = l.lot
      WHERE l.type_contenu = 'video' AND l.archive_le IS NULL
      ORDER BY o.numero DESC, l.rang LIMIT 200`,
  );
  return lignes.map((l) => ({ id: l.id, format: l.format, etat: l.etat, surLeSite: l.sur_le_site, retireLe: l.sur_le_site_retire_le }));
}

/**
 * Coche ou décoche « Sur le site » pour une vidéo. Rien n'est supprimé : décocher note la date du retrait.
 * Une ligne inconnue, archivée ou qui n'est pas une vidéo ne change rien. Rend vrai si la ligne a changé.
 */
export async function changerSurLeSite(id: string, coche: boolean): Promise<boolean> {
  const lignes = await requete<{ id: string }>(
    coche
      ? `UPDATE lot_ligne SET sur_le_site = true, sur_le_site_retire_le = NULL, modifie_le = now()
          WHERE id = $1 AND type_contenu = 'video' AND archive_le IS NULL AND sur_le_site = false RETURNING id`
      : `UPDATE lot_ligne SET sur_le_site = false, sur_le_site_retire_le = now(), modifie_le = now()
          WHERE id = $1 AND type_contenu = 'video' AND archive_le IS NULL AND sur_le_site = true RETURNING id`,
    [id],
  );
  if (lignes.length === 0) return false;
  await journaliser("site", coche ? "Une vidéo est cochée « Sur le site »." : "Une vidéo n'est plus cochée « Sur le site ».", { cible: id });
  return true;
}

export interface Prospects {
  depuis: string;
  jusqua: string;
  totaux: TotalReseau[];
}

/** Agrégats déjà reçus sur les 7 derniers jours, par réseau. Ni compte ni mot ne sortent d'ici. */
export async function lireProspects(): Promise<Prospects> {
  const aujourdhui = jourUtcDe(Date.now());
  const depuis = ajouterJours(aujourdhui, -JOURS_PROSPECTS);
  const jusqua = ajouterJours(aujourdhui, -1);
  const lignes = await lireAgregats(depuis, jusqua);
  return { depuis, jusqua, totaux: totauxParReseau(lignes.map((l) => ({ reseau: l.reseau, demandes: l.demandes, guides_envoyes: l.guides_envoyes, accords: l.accords }))) };
}

/** Nombre d'oppositions par canal. Aucune empreinte ni adresse n'est lue. */
export async function lireOppositionsParCanal(): Promise<{ canal: string; nombre: number }[]> {
  const lignes = await requete<{ canal: string; n: string }>("SELECT canal, count(*) AS n FROM opposition GROUP BY canal");
  return ["tous", "instagram", "facebook", "email"].map((canal) => ({ canal, nombre: Number(lignes.find((l) => l.canal === canal)?.n ?? 0) }));
}
