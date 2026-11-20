/** Porte du studio : la semaine proposée par l'Usine, en LECTURE SEULE (docs/CONTRAT-PORTE.md). Rien n'est écrit, rien n'est envoyé. */
import { demandeSemaine } from "@/contrats";
import { lireSemaineProposee } from "@/planification/lecture";
import { json, postPorte } from "@/porte/http";

export const POST = postPorte("planification/semaine", demandeSemaine, async (d) => json(await lireSemaineProposee(d.debut, d.reseaux)));
