/** Porte du studio : l'état « Tout arrêter », lu par le studio et par l'export du cockpit (docs/CONTRAT-PORTE.md). Secret exigé, aucune donnée de personne. */
import { json, routePorte } from "@/porte/http";
import { etatArret } from "@/arret";

export async function GET(requete: Request) {
  return routePorte("arret", requete, async () => json(await etatArret()));
}
