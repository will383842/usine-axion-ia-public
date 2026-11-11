/**
 * Chargement automatique des bases, au démarrage du serveur (après les migrations) : l'import existant est lancé
 * si la table `metier` est vide, ou si les fichiers de `bases/` ont changé depuis le dernier chargement (empreinte gardée
 * dans le réglage `bases.empreinte`). L'import garde ses règles (il n'écrit jamais `metier.allume`, ne défait aucune
 * validation) ; l'empreinte s'écrit dans sa transaction. Une erreur est journalisée (`cible = 'bases-erreur'`),
 * jamais levée : le démarrage n'en dépend pas.
 */
import "server-only";
import { createHash } from "node:crypto";
import { ecrireReglage, journaliser, lireReglage } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { importerBases, lireFichiersBases } from "./importer";
import type { FichierBase } from "./preparation";

export const REGLAGE_EMPREINTE = "bases.empreinte";
export const CIBLE_ERREUR_BASES = "bases-erreur";

export type ResultatAutomatique = "importees" | "inchangees" | "erreur";

/** Empreinte des fichiers lus : leurs noms et leurs textes, dans l'ordre des noms. */
export function empreinteDesFichiers(fichiers: FichierBase[]): string {
  const h = createHash("sha256");
  for (const f of [...fichiers].sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0))) h.update(`${f.nom}\0${f.texte}\0`);
  return h.digest("hex");
}

export async function importerSiBesoin(fichiers?: FichierBase[]): Promise<ResultatAutomatique> {
  try {
    const lus = fichiers ?? (await lireFichiersBases());
    const empreinte = empreinteDesFichiers(lus);
    const [{ vide }] = await requete<{ vide: boolean }>("SELECT NOT EXISTS (SELECT 1 FROM metier) AS vide");
    if (!vide && (await lireReglage<string | null>(REGLAGE_EMPREINTE, null)) === empreinte) return "inchangees";
    await transaction(async () => {
      await importerBases(lus);
      await ecrireReglage(REGLAGE_EMPREINTE, empreinte);
    });
    return "importees";
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    console.error(`[usine] chargement automatique des bases interrompu : ${detail}`);
    await journaliser("import", `Chargement automatique des bases interrompu, rien n'a changé : ${detail}`, { cible: CIBLE_ERREUR_BASES }).catch(() => undefined);
    return "erreur";
  }
}

/** La dernière erreur de chargement des bases, si aucun chargement n'a réussi depuis (null sinon). */
export async function derniereErreurBases(): Promise<{ le: Date; message: string } | null> {
  try {
    const [r] = await requete<{ le: Date; message: string }>(
      `SELECT le, message FROM journal
        WHERE sujet = 'import' AND cible = $1
          AND id > coalesce((SELECT max(id) FROM journal WHERE sujet = 'import' AND cible = 'bases'), 0)
        ORDER BY id DESC LIMIT 1`,
      [CIBLE_ERREUR_BASES],
    );
    return r ?? null;
  } catch {
    return null;
  }
}
