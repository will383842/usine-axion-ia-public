/**
 * U-VEILLE · règles pures de l'alerte de silence : deux alertes calculées d'après la base, sans horloge cachée
 * (le moment est un argument), sans IA. Ni base ni réseau. Aucun texte libre venu de la base.
 */
export const INTERRUPTEUR_VEILLE = "veille";
export const SEUIL_HEURES = 24;
const SEUIL_MS = SEUIL_HEURES * 3_600_000;

export type CodeAlerte = "semaine-non-proposee" | "commande-sans-reponse";

export interface EntreesVeille {
  /** Lignes du calendrier à venir, actives, qu'aucune proposition au Studio n'a encore couvertes. */
  lignesSansProposition: number;
  /** Création de la plus ancienne de ces lignes. */
  plusAncienneSansProposition: Date | null;
  /** Dernier envoi d'une proposition au Studio (tous réseaux). */
  derniereProposition: Date | null;
  /** Commandes envoyées au Studio dont aucun état n'est revenu. */
  commandesSansReponse: number;
  /** Envoi de la plus ancienne de ces commandes. */
  plusAncienneSansReponse: Date | null;
}

export interface Alerte {
  code: CodeAlerte;
  nombre: number;
}

const plusDeSeuil = (depuis: Date | null, maintenant: Date) => depuis !== null && maintenant.getTime() - depuis.getTime() > SEUIL_MS;

export function alertesDeVeille(e: EntreesVeille, maintenant: Date): Alerte[] {
  const alertes: Alerte[] = [];
  // Semaine attendue mais non proposée : des lignes attendent depuis plus de 24 h ET aucune proposition récente.
  if (e.lignesSansProposition > 0 && plusDeSeuil(e.plusAncienneSansProposition, maintenant) && !(e.derniereProposition && !plusDeSeuil(e.derniereProposition, maintenant)))
    alertes.push({ code: "semaine-non-proposee", nombre: e.lignesSansProposition });
  if (e.commandesSansReponse > 0 && plusDeSeuil(e.plusAncienneSansReponse, maintenant))
    alertes.push({ code: "commande-sans-reponse", nombre: e.commandesSansReponse });
  return alertes;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n === 1 ? un : plusieurs}`;

export interface CarteVeille {
  cle: string;
  titre: string;
  detail: string;
  bouton: string;
  lien: string;
  urgence: number;
}

/** Une carte par alerte : un verbe, un bouton. Rien de la base n'y figure que le nombre. */
export function cartesDeVeille(alertes: Alerte[]): CarteVeille[] {
  return alertes.map((a) =>
    a.code === "semaine-non-proposee"
      ? {
          cle: "calcul:veille-semaine-non-proposee",
          titre: `Proposer la semaine : ${pluriel(a.nombre, "publication attend", "publications attendent")} depuis plus d'un jour`,
          detail: "Aucune semaine n'a été proposée au Studio depuis plus de 24 h.",
          bouton: "Voir ma semaine",
          lien: "/semaine",
          urgence: 70,
        }
      : {
          cle: "calcul:veille-commande-sans-reponse",
          titre: `Relire l'état de ${pluriel(a.nombre, "publication proposée", "publications proposées")} au Studio`,
          detail: "Le Studio n'a pas répondu depuis plus de 24 h.",
          bouton: "Voir le calendrier",
          lien: "/calendrier",
          urgence: 75,
        },
  );
}

export interface EtatCockpit {
  version: 1;
  calculeLe: string;
  alertes: Alerte[];
}

/** Ce que lit le cockpit : codes, nombres et instant, rien d'autre. */
export const etatPourCockpit = (alertes: Alerte[], maintenant: Date): EtatCockpit => ({ version: 1, calculeLe: maintenant.toISOString(), alertes });
