/** Empreinte des bases embarquées (bases.source.json), publiée par /api/sante pour la garde d'exécution (ADR 0001 § 4c). Tronquée : aucun sha de commit n'est publié. */
import temoin from "../../bases.source.json";

export const empreinteBases = { empreinte: (temoin.empreinte as string).slice(0, 12) };
