/**
 * Accès aux données de l'Usine : un dépôt par table (`depots.<table>`), `journaliser()`,
 * `interrupteurAllume(code)`, et quelques aides communes. Pour une requête plus riche :
 * `requete()` et `transaction()` de `@/lib/base` (jamais de suppression).
 */
import "server-only";
import { requete } from "@/lib/base";
import { creerDepot, creerDepotAjoutSeul } from "./depot";
import { COLONNES_BASES, COLONNES_PROPRES_BASES, COLONNES_TECHNIQUES_BASES, COLONNES_USINE, type NomTableBase } from "./schema";
import type * as T from "./types";

function depotBase<N extends NomTableBase>(table: N) {
  return creerDepot<T.LigneBase<N>>({
    table,
    cle: "code",
    colonnes: [...COLONNES_BASES[table], ...COLONNES_TECHNIQUES_BASES, ...(COLONNES_PROPRES_BASES[table] ?? [])],
    archivage: "etat",
  });
}

export const depots = {
  // Tables des bases (archiver = etat 'retire').
  secteur: depotBase("secteur"),
  metier: depotBase("metier"),
  public: depotBase("public"),
  douleur: depotBase("douleur"),
  objection: depotBase("objection"),
  souci_releve: depotBase("souci_releve"),
  taille: depotBase("taille"),
  famille: depotBase("famille"),
  sujet: depotBase("sujet"),
  actualite: depotBase("actualite"),
  cas_usage: depotBase("cas_usage"),
  format_video: depotBase("format_video"),
  format_autre: depotBase("format_autre"),
  publication: depotBase("publication"),
  appel: depotBase("appel"),
  voix: depotBase("voix"),
  interdit: depotBase("interdit"),
  fait: depotBase("fait"),
  accroche: depotBase("accroche"),
  // Tables de l'Usine (archiver = archive_le).
  service: creerDepot<T.Service>({ table: "service", cle: "code", colonnes: COLONNES_USINE.service, archivage: "archive_le" }),
  compte: creerDepot<T.Compte>({ table: "compte", cle: "code", colonnes: COLONNES_USINE.compte, archivage: "archive_le" }),
  reglage: creerDepot<T.Reglage>({ table: "reglage", cle: "cle", colonnes: COLONNES_USINE.reglage, archivage: null, json: ["valeur"] }),
  interrupteur: creerDepot<T.Interrupteur>({ table: "interrupteur", cle: "code", colonnes: COLONNES_USINE.interrupteur, archivage: "archive_le" }),
  journal: creerDepotAjoutSeul<T.LigneJournal>({ table: "journal", cle: "id", colonnes: COLONNES_USINE.journal, json: ["donnees"] }),
  refus: creerDepot<T.Refus>({ table: "refus", cle: "code", colonnes: COLONNES_USINE.refus, archivage: "archive_le" }),
  lot: creerDepot<T.Lot>({ table: "lot", cle: "id", colonnes: COLONNES_USINE.lot, archivage: "archive_le", json: ["reglages"] }),
  lot_ligne: creerDepot<T.LotLigne>({ table: "lot_ligne", cle: "id", colonnes: COLONNES_USINE.lot_ligne, archivage: "archive_le", json: ["fins", "paquet"] }),
  cadeau: creerDepot<T.Cadeau>({ table: "cadeau", cle: "code", colonnes: COLONNES_USINE.cadeau, archivage: "archive_le" }),
  mot: creerDepot<T.Mot>({ table: "mot", cle: "code", colonnes: COLONNES_USINE.mot, archivage: "archive_le", json: ["automatisations"] }),
  mot_texte: creerDepot<T.MotTexte>({ table: "mot_texte", cle: "id", colonnes: COLONNES_USINE.mot_texte, archivage: "archive_le" }),
  mot_branche: creerDepot<T.MotBrancheLigne>({ table: "mot_branche", cle: "id", colonnes: COLONNES_USINE.mot_branche, archivage: "archive_le" }),
  /** Opposition : on n'en retire jamais une. */
  opposition: creerDepotAjoutSeul<T.OppositionLigne>({ table: "opposition", cle: "id", colonnes: COLONNES_USINE.opposition }),
  carte: creerDepot<T.Carte>({ table: "carte", cle: "id", colonnes: COLONNES_USINE.carte, archivage: "archive_le" }),
  compte_a_suivre: creerDepot<T.CompteASuivre>({ table: "compte_a_suivre", cle: "code", colonnes: COLONNES_USINE.compte_a_suivre, archivage: "archive_le" }),
  calendrier_ligne: creerDepot<T.CalendrierLigne>({ table: "calendrier_ligne", cle: "id", colonnes: COLONNES_USINE.calendrier_ligne, archivage: "archive_le" }),
  deja_fabrique: creerDepot<T.DejaFabrique>({ table: "deja_fabrique", cle: "id", colonnes: COLONNES_USINE.deja_fabrique, archivage: "archive_le" }),
  releve_mot: creerDepot<T.ReleveMot>({ table: "releve_mot", cle: "id", colonnes: COLONNES_USINE.releve_mot, archivage: "archive_le" }),
};

export type NomDepot = keyof typeof depots;

/** Note un changement au journal, en une phrase lisible par Will (jamais une donnée de personne en clair). */
export async function journaliser(sujet: string, message: string, options: { cible?: string; donnees?: unknown } = {}): Promise<void> {
  await depots.journal.ajouter({ sujet, message, cible: options.cible ?? null, donnees: options.donnees ?? null });
}

/** Tout est livré éteint : un interrupteur absent, archivé ou illisible vaut « éteint ». */
export async function interrupteurAllume(code: string): Promise<boolean> {
  try {
    const [r] = await requete<{ allume: boolean }>("SELECT allume FROM interrupteur WHERE code = $1 AND archive_le IS NULL", [code]);
    return r?.allume === true;
  } catch {
    return false;
  }
}

/** Valeur d'un réglage, ou la valeur par défaut s'il n'existe pas. */
export async function lireReglage<V>(cle: string, defaut: V): Promise<V> {
  const r = await depots.reglage.lire(cle);
  return r ? (r.valeur as V) : defaut;
}

export async function ecrireReglage(cle: string, valeur: unknown): Promise<void> {
  await depots.reglage.ecrire({ cle, valeur });
}

/** Prochain identifiant de lot : `L<n>`. */
export async function prochainLot(): Promise<{ id: string; numero: number }> {
  const [r] = await requete<{ n: string }>("SELECT nextval('lot_numero') AS n");
  const numero = Number(r.n);
  return { id: `L${numero}`, numero };
}

export type * from "./types";
