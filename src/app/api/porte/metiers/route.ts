/** Porte du studio : les métiers, pour le filtre du studio (docs/CONTRAT-PORTE.md). */
import { json, routePorte } from "@/porte/http";
import { listerMetiers } from "@/porte";

export async function GET(requete: Request) {
  return routePorte("metiers", requete, async () => json({ metiers: await listerMetiers() }));
}
