/** Empreinte des bases embarquées (bases.source.json), publiée par /api/sante pour la garde d'exécution (ADR 0001 § 4c). */
import temoin from "../../bases.source.json";

export const empreinteBases = { empreinte: temoin.empreinte as string, commit: temoin.commit as string };
