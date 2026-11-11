/** Porte du studio : n sujets neufs (docs/CONTRAT-PORTE.md). Garde par secret partagé (src/porte/acces.ts). */
import { demandeSujets } from "@/contrats";
import { json, postPorte } from "@/porte/http";
import { proposerSujets } from "@/porte";

export const POST = postPorte("sujets", demandeSujets, async (d) => json(await proposerSujets(d)));
