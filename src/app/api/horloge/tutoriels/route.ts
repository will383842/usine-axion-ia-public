/** Réserve de tutoriels : déclencheur appelé toutes les 30 minutes par la tâche du serveur. Même secret que l'horloge (401 sans détail) ; aucune donnée de personne. */
import { accesHorloge } from "@/planification/horloge";
import { json } from "@/porte/http";
import { passerTutoriels } from "@/tutoriels";

export async function POST(requete: Request) {
  if (!accesHorloge(requete)) return json({ erreur: "Accès refusé." }, 401);
  return json(await passerTutoriels());
}
