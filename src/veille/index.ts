/** U-VEILLE · alerte de silence : lecture en base (deux alertes), cartes de « Ma journée », état local pour le cockpit. */
import "server-only";
import { writeFile } from "node:fs/promises";
import { interrupteurAllume } from "@/donnees";
import { requete } from "@/lib/base";
import { alertesDeVeille, cartesDeVeille, etatPourCockpit, INTERRUPTEUR_VEILLE, type Alerte, type CarteVeille, type EntreesVeille } from "./regles";

export * from "./regles";

export const veilleAllumee = () => interrupteurAllume(INTERRUPTEUR_VEILLE);

interface Ligne {
  sans_proposition: string;
  plus_ancienne_sans_proposition: Date | null;
  derniere_proposition: Date | null;
  sans_reponse: string;
  plus_ancienne_sans_reponse: Date | null;
}

/** Lecture seule : ce que la base permet de constater, sans appel au Studio. */
export async function lireEntrees(): Promise<EntreesVeille> {
  const [r] = await requete<Ligne>(
    `SELECT
       (SELECT count(*) FROM calendrier_ligne c
         WHERE c.archive_le IS NULL AND c.etat = 'brouillon' AND c.prevue_le > now() AND c.prevue_le < now() + interval '7 days'
           AND NOT EXISTS (SELECT 1 FROM commande_studio s WHERE s.calendrier_ligne = c.id AND s.archive_le IS NULL AND s.etat_envoi IN ('envoyee', 'mise_de_cote_studio'))) AS sans_proposition,
       (SELECT min(c.cree_le) FROM calendrier_ligne c
         WHERE c.archive_le IS NULL AND c.etat = 'brouillon' AND c.prevue_le > now() AND c.prevue_le < now() + interval '7 days'
           AND NOT EXISTS (SELECT 1 FROM commande_studio s WHERE s.calendrier_ligne = c.id AND s.archive_le IS NULL AND s.etat_envoi IN ('envoyee', 'mise_de_cote_studio'))) AS plus_ancienne_sans_proposition,
       (SELECT max(envoyee_le) FROM commande_studio WHERE archive_le IS NULL) AS derniere_proposition,
       (SELECT count(*) FROM commande_studio WHERE archive_le IS NULL AND etat_envoi = 'envoyee' AND etat_studio IS NULL) AS sans_reponse,
       (SELECT min(envoyee_le) FROM commande_studio WHERE archive_le IS NULL AND etat_envoi = 'envoyee' AND etat_studio IS NULL) AS plus_ancienne_sans_reponse`,
  );
  return {
    lignesSansProposition: Number(r?.sans_proposition ?? 0),
    plusAncienneSansProposition: r?.plus_ancienne_sans_proposition ?? null,
    derniereProposition: r?.derniere_proposition ?? null,
    commandesSansReponse: Number(r?.sans_reponse ?? 0),
    plusAncienneSansReponse: r?.plus_ancienne_sans_reponse ?? null,
  };
}

/** Alertes du moment ; vide si l'interrupteur est éteint (rien n'est lu). */
export async function alertesDuMoment(maintenant: Date = new Date()): Promise<Alerte[]> {
  if (!(await veilleAllumee())) return [];
  return alertesDeVeille(await lireEntrees(), maintenant);
}

/**
 * Dépose l'état d'alerte dans le fichier local lu par le cockpit (chemin : VEILLE_ETAT_FICHIER, absent = rien n'est écrit).
 * Sans secret : codes, nombres, instant. Un échec d'écriture ne gêne jamais l'écran.
 */
async function deposerPourCockpit(alertes: Alerte[], maintenant: Date) {
  const chemin = process.env.VEILLE_ETAT_FICHIER;
  if (!chemin) return;
  try {
    await writeFile(chemin, JSON.stringify(etatPourCockpit(alertes, maintenant)) + "\n", "utf8");
  } catch {
    /* le cockpit relira au prochain passage */
  }
}

/** Cartes d'alerte pour « Ma journée » ; une carte disparaît seule quand l'activité revient. */
export async function cartesDeLaVeille(): Promise<CarteVeille[]> {
  const maintenant = new Date();
  const alertes = await alertesDuMoment(maintenant);
  if (!(await veilleAllumee())) return [];
  await deposerPourCockpit(alertes, maintenant);
  return cartesDeVeille(alertes);
}
