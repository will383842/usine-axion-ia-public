/** Porte du studio (v1.1) : plusieurs sujets retenus au studio d'un coup, idempotent (docs/CONTRAT-PORTE.md). */
import { retenirLot as schemaLot } from "@/contrats";
import { json, postPorte } from "@/porte/http";
import { retenirLot } from "@/porte";

export const POST = postPorte("sujets/retenir-lot", schemaLot, async (l) => json(await retenirLot(l)));
