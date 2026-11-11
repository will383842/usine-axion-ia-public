/** Porte du studio : un sujet retenu au studio devient « déjà fabriqué » (docs/CONTRAT-PORTE.md). */
import { retenirSujet as schemaRetenir } from "@/contrats";
import { json, postPorte } from "@/porte/http";
import { retenirSujet } from "@/porte";

export const POST = postPorte("sujets/retenir", schemaRetenir, async (s) => json(await retenirSujet(s)));
