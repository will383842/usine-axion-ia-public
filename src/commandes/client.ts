/** U-COMMANDE · appels 1 et 2 vers le Studio, par la passerelle seulement, sous « Tout arrêter ». */
import "server-only";
import { sousArret } from "@/arret";
import { appelerStudio } from "@/passerelles/studio";
import type { CorpsCommandeStudio } from "@/contrats";

export type ResultatAppel =
  | { genre: "reponse"; statut: number; corps: unknown }
  | { genre: "arret" }
  | { genre: "pas_branche" }
  | { genre: "sans_reponse" };

async function appeler(chemin: string, corps: unknown): Promise<ResultatAppel> {
  try {
    const r = await sousArret("commande", () => appelerStudio(chemin, corps));
    if (!r.fait) return { genre: "arret" };
    if (!r.valeur.envoye) return { genre: "pas_branche" };
    return { genre: "reponse", statut: r.valeur.statut, corps: r.valeur.corps };
  } catch {
    return { genre: "sans_reponse" };
  }
}

/** Appel 1 : proposer une ligne du calendrier. */
export const envoyerCommande = (corps: CorpsCommandeStudio) => appeler("usine/commandes", corps);
/** Appel 2 : relire l'état d'une commande (POST, comme le sert le Studio). */
export const lireCommande = (cle: string) => appeler(`usine/commandes/${cle}`, { contrat: 2 });
