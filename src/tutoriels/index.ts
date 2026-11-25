/**
 * Réserve de tutoriels · un passage (appelé par l'horloge toutes les 30 minutes) : demander au Studio de prendre le tutoriel suivant de sa réserve,
 * suivre sa fabrication, puis, quand la vidéo est « à valider », poser un créneau au calendrier et proposer la commande avec `videoId`.
 * Éteint par défaut (interrupteur `tutoriel.reserve`). Rien n'est publié ni payé d'ici : chaque dépense reste gardée côté Studio.
 * Clé écrite en base AVANT l'appel ; même clé rejouée tant que le Studio n'a pas répondu `pris` ou `echec` ; une nouvelle clé seulement après `echec`,
 * `a_revoir` ou `en_reserve` (2 clés au plus par semaine). Tous les appels passent par la passerelle du Studio et par `sousArret`.
 */
import "server-only";
import { estArrete, sousArret } from "@/arret";
import { ajouterJours, parSemaine } from "@/calendrier/regles";
import { comptesActifs } from "@/calendrier/compte-actif";
import { commandesAllumees, proposerAuStudio } from "@/commandes/service";
import { corpsTirageTutoriel } from "@/contrats";
import { interrupteurAllume, journaliser } from "@/donnees";
import { pool, requete, transaction } from "@/lib/base";
import { appelerStudio, lireOccupesDuStudio } from "@/passerelles/studio";
import { SQL_LIGNES_SEMAINE, lignesDeLaSemaine, lireOccupes, type LigneBase } from "@/planification/regles";
import { lireQuotas, lireReglagesTirage } from "@/reglages";
import {
  ENVOIS_COMMANDE_MAX,
  ESSAIS_MAX_PAR_SEMAINE,
  INTERRUPTEUR_TUTORIEL,
  MINUTES_ENTRE_DEMANDES,
  MINUTES_ENTRE_RELECTURES,
  NOTE_LIGNE_TUTORIEL,
  PAUSE_PASSAGERE_MINUTES,
  RELECTURES_MAX,
  RESEAU_TUTORIEL,
  cleTutoriel,
  creneauTutoriel,
  lireReponseSuivi,
  lireReponseTirage,
  lundiCible,
  refusDefinitif,
  pauseCommandeMinutes,
} from "./regles";

export interface ResultatTutoriels {
  fait: string[];
}

interface Tirage {
  cle: string;
  essai: number;
  etat_tirage: "demande" | "pris" | "echec";
  etat_studio: string | null;
  demandee_le: Date | null;
  archive_le: Date | null;
}

const minutesAvant = (maintenant: Date, minutes: number) => new Date(maintenant.getTime() - minutes * 60_000);

/** Un appel au Studio, par la passerelle et sous « Tout arrêter » ; `null` si rien n'est parti ou si le Studio n'a pas répondu. */
async function appeler(chemin: string, corps: unknown): Promise<{ statut: number; corps: unknown } | null> {
  try {
    const r = await sousArret("commande", () => appelerStudio(chemin, corps));
    if (!r.fait || !r.valeur.envoye) return null;
    return { statut: r.valeur.statut, corps: r.valeur.corps };
  } catch {
    return null;
  }
}

/** Une ligne de journal au plus par jour pour un même message et une même cible (jamais de titre ni de nom de fichier). */
async function journalerParJour(maintenant: Date, cle: string, message: string, donnees: Record<string, unknown>): Promise<void> {
  const deja = await requete(`SELECT 1 AS n FROM journal WHERE sujet = 'tutoriel' AND cible = $1 AND message = $2 AND le > $3 LIMIT 1`, [cle, message, minutesAvant(maintenant, 24 * 60)]);
  if (deja.length === 0) await journaliser("tutoriel", message, { cible: cle, donnees });
}

const ACTIF = (t: Tirage) => t.archive_le === null && t.etat_tirage !== "echec" && (t.etat_studio === null || t.etat_studio === "pris" || t.etat_studio === "fait");

/** Y a-t-il, pour ce lundi, un tirage pris au Studio dont le créneau n'est pas encore posé ? (lecture seule, pour la semaine proposée) */
export async function tirageTutorielEnCours(lundi: string): Promise<boolean> {
  const l = await requete(
    `SELECT 1 AS n FROM tutoriel_tirage
      WHERE lundi = $1::date AND archive_le IS NULL AND etat_tirage = 'pris' AND (etat_studio IS NULL OR etat_studio IN ('pris', 'fait')) AND calendrier_ligne IS NULL LIMIT 1`,
    [lundi],
  );
  return l.length > 0;
}

/** (c) Demander : une ligne par clé, écrite avant l'appel ; même clé rejouée au plus une fois par heure. */
async function demander(maintenant: Date, fait: string[]): Promise<void> {
  const lundi = lundiCible(maintenant);
  const lignes = await requete<Tirage>(`SELECT cle, essai, etat_tirage, etat_studio, demandee_le, archive_le FROM tutoriel_tirage WHERE lundi = $1::date ORDER BY essai`, [lundi]);
  let courant = lignes.find(ACTIF);
  if (!courant) {
    if (lignes.length >= ESSAIS_MAX_PAR_SEMAINE) {
      await journalerParJour(maintenant, `tuto-${lundi}`, "Plus aucun essai cette semaine pour le tutoriel de la réserve.", { etat: "plafond" });
      fait.push("plafond_essais");
      return;
    }
    const compte = (await comptesActifs())[RESEAU_TUTORIEL];
    const { rythmes } = await lireReglagesTirage();
    if (!compte || parSemaine(rythmes[RESEAU_TUTORIEL]) <= 0) {
      fait.push("pas_de_place");
      return;
    }
    const cle = cleTutoriel(lundi, lignes.length + 1);
    await requete(`INSERT INTO tutoriel_tirage (cle, lundi, essai, reseau) VALUES ($1, $2::date, $3, $4) ON CONFLICT DO NOTHING`, [cle, lundi, lignes.length + 1, RESEAU_TUTORIEL]);
    [courant] = await requete<Tirage>(`SELECT cle, essai, etat_tirage, etat_studio, demandee_le, archive_le FROM tutoriel_tirage WHERE cle = $1`, [cle]);
  }
  if (!courant || courant.etat_tirage !== "demande") return;
  if (courant.demandee_le && courant.demandee_le.getTime() > minutesAvant(maintenant, MINUTES_ENTRE_DEMANDES).getTime()) return;

  const r = await appeler("usine/tutoriels", corpsTirageTutoriel.parse({ contrat: 2, cle: courant.cle, source: "reserve", jour: lundi }));
  const lu = r ? lireReponseTirage(r.statut, r.corps) : ({ genre: "rejouer", raison: "sans_reponse" } as const);
  if (lu.genre === "pris") {
    await requete(
      `UPDATE tutoriel_tirage SET etat_tirage = 'pris', etat_studio = 'pris', element_id = $2, video_id = coalesce($3, video_id), raison = NULL, demandee_le = $4, modifie_le = now() WHERE cle = $1`,
      [courant.cle, lu.elementId, lu.videoId ?? null, maintenant],
    );
    await journaliser("tutoriel", "Le Studio a pris un tutoriel de la réserve.", { cible: courant.cle, donnees: { etat: "pris" } });
    fait.push("pris");
  } else if (lu.genre === "echec") {
    await requete(`UPDATE tutoriel_tirage SET etat_tirage = 'echec', element_id = $2, raison = 'echec', demandee_le = $3, modifie_le = now() WHERE cle = $1`, [courant.cle, lu.elementId, maintenant]);
    await journaliser("tutoriel", "Le Studio n'a pas pu fabriquer ce tutoriel : un autre essai suivra.", { cible: courant.cle, donnees: { etat: "echec" } });
    fait.push("echec");
  } else {
    await requete(`UPDATE tutoriel_tirage SET raison = $2, demandee_le = $3, modifie_le = now() WHERE cle = $1`, [courant.cle, lu.raison, maintenant]);
    await journalerParJour(maintenant, courant.cle, "Le Studio n'a pas pris de tutoriel pour l'instant.", { etat: "rejouer", raison: lu.raison });
    fait.push("a_rejouer");
  }
}

/** (d) Suivre : 10 relectures au plus, une par clé toutes les 30 minutes. Avant « à valider » : la fabrication ; après la pose : jusqu'à `prevue_le`, pour retirer le créneau si le Studio dit « à revoir » ou « refusée ». */
async function suivre(maintenant: Date, fait: string[]): Promise<void> {
  const lignes = await requete<{ cle: string; a_valider_le: Date | null; calendrier_ligne: string | null }>(
    `SELECT t.cle, t.a_valider_le, t.calendrier_ligne::text AS calendrier_ligne FROM tutoriel_tirage t LEFT JOIN calendrier_ligne c ON c.id = t.calendrier_ligne
      WHERE t.etat_tirage = 'pris' AND t.archive_le IS NULL AND (t.etat_studio IS NULL OR t.etat_studio IN ('pris', 'fait'))
        AND (t.a_valider_le IS NULL OR (c.id IS NOT NULL AND c.archive_le IS NULL AND c.prevue_le > $3))
        AND (t.relue_le IS NULL OR t.relue_le <= $1) ORDER BY t.relue_le ASC NULLS FIRST, t.cle LIMIT $2`,
    [minutesAvant(maintenant, MINUTES_ENTRE_RELECTURES), RELECTURES_MAX, maintenant],
  );
  for (const { cle, a_valider_le, calendrier_ligne } of lignes) {
    const r = await appeler(`usine/tutoriels/${cle}`, { contrat: 2 });
    if (!r) break;
    const lu = lireReponseSuivi(r.statut, r.corps);
    const etatStocke = lu.genre === "perdu" ? (lu.etat === "refusee" ? "a_revoir" : lu.etat) : null;
    if (a_valider_le) {
      // Déjà « à valider » : seul un état perdu compte (le créneau est retiré, rien n'est supprimé) ; le reste ne change rien.
      if (lu.genre === "perdu" && calendrier_ligne) {
        await transaction(async () => {
          await requete(`UPDATE calendrier_ligne SET archive_le = now(), modifie_le = now() WHERE id = $1 AND archive_le IS NULL`, [calendrier_ligne]);
          // La commande du créneau ne compte plus dans le quota du jour (rien n'est supprimé ; côté Studio le créneau reste « proposé », aucune route d'annulation).
          await requete(`UPDATE commande_studio SET archive_le = now(), modifie_le = now() WHERE calendrier_ligne = $1 AND archive_le IS NULL`, [calendrier_ligne]);
          await requete(`UPDATE tutoriel_tirage SET etat_studio = $2, relue_le = $3, modifie_le = now() WHERE cle = $1`, [cle, etatStocke, maintenant]);
        });
        await journaliser("tutoriel", "Un tutoriel de la réserve est à revoir ou refusé : son créneau est retiré du calendrier, un autre essai suivra.", { cible: cle, donnees: { etat: lu.etat } });
        fait.push("retire");
      } else {
        await requete(`UPDATE tutoriel_tirage SET relue_le = $2 WHERE cle = $1`, [cle, maintenant]);
      }
      continue;
    }
    if (lu.genre === "a_valider") {
      await requete(`UPDATE tutoriel_tirage SET etat_studio = 'fait', video_id = $2, a_valider_le = $3, relue_le = $3, modifie_le = now() WHERE cle = $1`, [cle, lu.videoId, maintenant]);
      await journaliser("tutoriel", "Un tutoriel de la réserve est prêt à être validé dans le Studio.", { cible: cle, donnees: { etat: "a_valider" } });
      fait.push("a_valider");
    } else if (lu.genre === "perdu") {
      await requete(`UPDATE tutoriel_tirage SET etat_studio = $2, relue_le = $3, modifie_le = now() WHERE cle = $1`, [cle, etatStocke, maintenant]);
      await journaliser("tutoriel", "Un tutoriel de la réserve est à revoir : un autre essai suivra.", { cible: cle, donnees: { etat: lu.etat } });
      fait.push("perdu");
    } else if (lu.genre === "en_cours") {
      await requete(`UPDATE tutoriel_tirage SET etat_studio = $2, video_id = coalesce($3, video_id), relue_le = $4, modifie_le = now() WHERE cle = $1`, [cle, lu.etat, lu.videoId ?? null, maintenant]);
      fait.push("suivi");
    } else {
      await requete(`UPDATE tutoriel_tirage SET relue_le = $2 WHERE cle = $1`, [cle, maintenant]);
    }
  }
}

/** (e) Poser : le créneau de la semaine visée (sinon la suivante), sous verrou de ligne ; une seule ligne par tirage. */
export async function poser(maintenant: Date, fait: string[]): Promise<void> {
  // La date du créneau est posée par l'Usine pour ce tutoriel seul : `date_choisie = true` la met hors de portée de l'horloge de la semaine (aucun appel de programmation d'ici).
  const lignes = await requete<{ cle: string; lundi: string; reseau: string }>(
    `SELECT cle, lundi::text, reseau FROM tutoriel_tirage
      WHERE a_valider_le IS NOT NULL AND calendrier_ligne IS NULL AND archive_le IS NULL AND video_id IS NOT NULL AND etat_studio IN ('pris', 'fait') ORDER BY lundi, essai`,
  );
  for (const t of lignes) {
    // Les créneaux déjà pris du Studio, lus avant tout : sans lecture claire, rien n'est posé (on réessaie au passage suivant).
    const lecture = await sousArret("commande", () => lireOccupesDuStudio(t.lundi, ajouterJours(t.lundi, 13))).catch(() => null);
    if (!lecture || !lecture.fait || !lecture.valeur.envoye) continue;
    const occupes = lireOccupes(lecture.valeur.statut, lecture.valeur.corps);
    if (!occupes) continue;
    const compte = (await comptesActifs())[RESEAU_TUTORIEL];
    if (!compte) continue;
    const [{ rythmes }, quotas] = await Promise.all([lireReglagesTirage(), lireQuotas()]);
    let choix: { jour: string; instant: Date } | null = null;
    for (const lundi of [t.lundi, ajouterJours(t.lundi, 7)]) {
      const base = await requete<LigneBase>(SQL_LIGNES_SEMAINE, [lundi, ajouterJours(lundi, 6)]);
      const reelles = lignesDeLaSemaine(base).filter((l) => l.reseau === RESEAU_TUTORIEL);
      choix = creneauTutoriel({ lundi, reseau: RESEAU_TUTORIEL, compte, lignes: reelles, rythmes, quotas, occupes, maintenant });
      if (choix) break;
    }
    if (!choix) {
      await journalerParJour(maintenant, t.cle, "Aucun créneau libre pour le tutoriel de la réserve : placez-le vous-même dans le Studio.", { etat: "sans_creneau" });
      fait.push("sans_creneau");
      continue;
    }
    const instant = choix.instant;
    const pose = await transaction(async () => {
      const [courant] = await requete<{ calendrier_ligne: string | null }>(`SELECT calendrier_ligne::text FROM tutoriel_tirage WHERE cle = $1 FOR UPDATE`, [t.cle]);
      if (!courant || courant.calendrier_ligne) return false;
      const [l] = await requete<{ id: string }>(
        `INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le, etat, date_choisie, note) VALUES ($1, $2, 'video', $3, 'brouillon', true, $4) RETURNING id::text`,
        [RESEAU_TUTORIEL, compte, instant, NOTE_LIGNE_TUTORIEL],
      );
      await requete(`UPDATE tutoriel_tirage SET calendrier_ligne = $2, modifie_le = now() WHERE cle = $1`, [t.cle, l.id]);
      return true;
    });
    if (pose) {
      await journaliser("tutoriel", "Un créneau est posé pour le tutoriel de la réserve (proposé au Studio, à valider).", { cible: t.cle, donnees: { etat: "pose" } });
      fait.push("pose");
    }
  }
}

/**
 * Propose au Studio, avec `videoId`, chaque ligne de tutoriel dont la commande n'est pas partie (même clé de commande : jamais deux).
 * Seuls les refus DÉFINITIFS (400, 426, réponse non comprise) comptent : pause de 1 h, 2 h, 4 h…, arrêt après 6 envois, une ligne au journal.
 * Les erreurs passagères (409, 423, 429, 5xx, silence, pas branché, arrêt) sont rejouées sans limite, avec une pause de 30 min, et ne font jamais abandonner.
 */
async function commander(maintenant: Date, fait: string[]): Promise<void> {
  const lignes = await requete<{ id: string; cle: string; commande_essais: number }>(
    `SELECT t.calendrier_ligne::text AS id, t.cle, t.commande_essais FROM tutoriel_tirage t JOIN calendrier_ligne c ON c.id = t.calendrier_ligne
      WHERE t.a_valider_le IS NOT NULL AND t.archive_le IS NULL AND c.archive_le IS NULL AND c.prevue_le > now()
        AND t.commande_essais < $1 AND (t.commande_prochaine_le IS NULL OR t.commande_prochaine_le <= $2)
        AND NOT EXISTS (SELECT 1 FROM commande_studio s WHERE s.calendrier_ligne = t.calendrier_ligne AND s.archive_le IS NULL AND s.etat_envoi IN ('envoyee', 'mise_de_cote_studio'))
      ORDER BY t.lundi, t.essai LIMIT 5`,
    [ENVOIS_COMMANDE_MAX, maintenant],
  );
  for (const { id, cle, commande_essais } of lignes) {
    const r = await proposerAuStudio(id);
    if (r.etat_envoi === "envoyee" || r.etat_envoi === "mise_de_cote_studio") {
      fait.push("commande");
      continue;
    }
    fait.push("commande_a_rejouer");
    if (r.etat_envoi !== "non_envoyee") continue; // rien n'est parti (interrupteur, ligne absente) : pas de pause
    if (!refusDefinitif(r.message)) {
      // Passager : on ne compte pas, on attend un peu (30 min) et on rejoue sans fin.
      await requete(`UPDATE tutoriel_tirage SET commande_prochaine_le = $2, modifie_le = now() WHERE cle = $1`, [cle, new Date(maintenant.getTime() + PAUSE_PASSAGERE_MINUTES * 60_000)]);
      continue;
    }
    const essais = commande_essais + 1;
    await requete(`UPDATE tutoriel_tirage SET commande_essais = $2, commande_prochaine_le = $3, modifie_le = now() WHERE cle = $1`, [cle, essais, new Date(maintenant.getTime() + pauseCommandeMinutes(essais) * 60_000)]);
    if (essais >= ENVOIS_COMMANDE_MAX) {
      await journaliser("tutoriel", "La commande de ce tutoriel n'est plus renvoyée au Studio après plusieurs refus : placez le créneau vous-même dans le Studio.", { cible: cle, donnees: { etat: "commande_abandonnee", essais } });
      fait.push("commande_abandonnee");
    }
  }
}

/** Un passage. Gardes d'abord (aucun appel si l'une manque) ; verrou pour qu'un seul passage tourne à la fois. */
export async function passerTutoriels(maintenant: Date = new Date()): Promise<ResultatTutoriels> {
  if (!(await interrupteurAllume(INTERRUPTEUR_TUTORIEL))) return { fait: ["eteint"] };
  if (!(await commandesAllumees())) return { fait: ["commandes_eteintes"] };
  if (await estArrete()) return { fait: ["arrete"] };
  const client = await pool().connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext('tutoriels')) AS ok`);
    if (rows[0]?.ok !== true) return { fait: ["deja_en_cours"] };
    try {
      const fait: string[] = [];
      await demander(maintenant, fait);
      await suivre(maintenant, fait);
      await poser(maintenant, fait);
      await commander(maintenant, fait);
      return { fait };
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('tutoriels'))`);
    }
  } finally {
    client.release();
  }
}
