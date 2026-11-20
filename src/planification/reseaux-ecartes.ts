/** Réseaux jamais proposés par la semaine tirée (YouTube est éteint pour l'instant). Module léger : lisible aussi par les écrans. */
export const RESEAUX_ECARTES: readonly string[] = ["youtube", "youtube-shorts"];

export const estReseauEcarte = (reseau: string): boolean => RESEAUX_ECARTES.includes(reseau);

export const PHRASE_RESEAU_ECARTE = "Ce réseau n'est pas encore proposé dans la semaine.";
