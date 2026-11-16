/** U-HORLOGE : déclencheur de la proposition hebdomadaire, appelé par la tâche du serveur. Secret propre exigé (401 sans détail) ; aucune donnée de personne. */
import { accesHorloge, lancerHorloge } from "@/planification/horloge";
import { json } from "@/porte/http";

export async function POST(requete: Request) {
  if (!accesHorloge(requete)) return json({ erreur: "Accès refusé." }, 401);
  return json(await lancerHorloge());
}
