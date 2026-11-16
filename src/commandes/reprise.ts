/** U-REPRISE · reprendre une commande coupée à mi-chemin, sans jamais en fabriquer deux. Éteint par défaut (même interrupteur que U-COMMANDE). */
import "server-only";
import { journaliser, type CommandeStudio } from "@/donnees";
import { requete } from "@/lib/base";
import { estArrete } from "@/arret";
import { PHRASE_ARRET, PHRASE_ETEINT, PHRASE_SANS_REPONSE, corpsDeLigne, type LigneAProposer } from "./regles";
import { commandesAllumees, proposerAuStudio } from "./service";

/** Une commande « à envoyer » depuis moins longtemps est peut-être encore en cours : on n'y touche pas. */
export const MINUTES_AVANT_REPRISE = 10;
export const REPRISES_MAX = 20;

export type IssueReprise = "reprise" | "annulee" | "deja_envoyee" | "rien";
export interface ResultatReprise {
  issue: IssueReprise;
  message: string;
}

const note = (cle: string, message: string, etat: string) => journaliser("commande", message, { cible: cle, donnees: { etat } });

/** Reprend une commande à sa dernière étape sûre : renvoie si elle n'était pas partie, s'annule si elle ne peut plus partir, ne refait rien si elle est partie. */
export async function reprendreCommande(cle: string): Promise<ResultatReprise> {
  if (!(await commandesAllumees())) return { issue: "rien", message: PHRASE_ETEINT };
  const [c] = await requete<CommandeStudio>(`SELECT * FROM commande_studio WHERE cle = $1 AND archive_le IS NULL`, [cle]);
  if (!c) return { issue: "rien", message: "Cette commande n'existe plus." };

  if (c.etat_envoi === "envoyee" || c.etat_envoi === "mise_de_cote_studio") {
    await note(cle, "Une commande déjà proposée au Studio n'a pas été renvoyée.", c.etat_envoi);
    return { issue: "deja_envoyee", message: "Déjà proposée au Studio : rien n'est renvoyé." };
  }
  // Seules les commandes dont on doute sont reprises : « à envoyer », ou « sans réponse du Studio » (la coupure a eu lieu avant la réponse).
  const doute = c.etat_envoi === "a_envoyer" || (c.etat_envoi === "non_envoyee" && c.message === PHRASE_SANS_REPONSE);
  if (!doute) {
    await note(cle, "Une commande non envoyée est laissée telle quelle : à relancer depuis le calendrier.", c.etat_envoi);
    return { issue: "rien", message: "Cette commande n'est pas partie : relancez-la depuis le calendrier." };
  }
  // « Tout arrêter » : on ne touche à rien, la commande reste reprenable.
  if (await estArrete()) return { issue: "rien", message: PHRASE_ARRET };
  const [ligne] = await requete<LigneAProposer>(
    `SELECT id::text, reseau, compte, type_contenu, prevue_le, lot_ligne FROM calendrier_ligne WHERE id = $1 AND archive_le IS NULL`,
    [c.calendrier_ligne],
  );
  const corps = ligne ? corpsDeLigne(ligne, new Date()) : null;
  if (!ligne || !corps || !corps.ok) {
    const phrase = !ligne ? "Cette ligne n'existe plus." : corps && !corps.ok ? corps.phrase : "Cette ligne n'est pas prête à être proposée.";
    await requete(`UPDATE commande_studio SET etat_envoi = 'non_envoyee', message = $2, modifie_le = now() WHERE cle = $1 AND (etat_envoi = 'a_envoyer' OR etat_envoi = 'non_envoyee')`, [cle, phrase]);
    await note(cle, "Une commande interrompue a été annulée : elle ne peut plus partir.", "non_envoyee");
    return { issue: "annulee", message: phrase };
  }
  const r = await proposerAuStudio(ligne.id); // même clé : le rejeu ne peut pas doubler la commande
  if (r.etat_envoi === "envoyee" || r.etat_envoi === "mise_de_cote_studio") {
    await note(cle, "Une commande interrompue a été reprise.", r.etat_envoi);
    return { issue: "reprise", message: r.message };
  }
  await note(cle, "Une commande interrompue n'a pas pu être reprise.", r.etat_envoi ?? "inchangee");
  return { issue: "rien", message: r.message };
}

/** Passage général : reprend les anciennes commandes « à envoyer » ou « sans réponse du Studio » (20 au plus, les plus anciennes d'abord). */
export async function reprendreInterrompues(max: number = REPRISES_MAX): Promise<{ reprises: number; message: string }> {
  if (!(await commandesAllumees())) return { reprises: 0, message: PHRASE_ETEINT };
  const limite = Math.min(Math.max(1, Math.trunc(max)), REPRISES_MAX);
  const lignes = await requete<{ cle: string }>(
    `SELECT cle FROM commande_studio WHERE (etat_envoi = 'a_envoyer' OR (etat_envoi = 'non_envoyee' AND message = $3)) AND archive_le IS NULL AND modifie_le < now() - make_interval(mins => $2)
      ORDER BY modifie_le ASC, cle LIMIT $1`,
    [limite, MINUTES_AVANT_REPRISE, PHRASE_SANS_REPONSE],
  );
  let reprises = 0;
  for (const { cle } of lignes) {
    const r = await reprendreCommande(cle);
    if (r.issue === "reprise" || r.issue === "annulee") reprises += 1;
  }
  return { reprises, message: reprises === 0 ? "Aucune commande à reprendre." : `${reprises} ${reprises === 1 ? "commande reprise" : "commandes reprises"}.` };
}
