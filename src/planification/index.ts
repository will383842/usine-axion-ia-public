/** U-PLANIF · proposer la semaine (sans IA) et l'envoyer au Studio par la porte, origine « usine ». Éteint par défaut ; geste explicite seulement. */
import "server-only";
import { sousArret } from "@/arret";
import { cleCommande } from "@/commandes/regles";
import { PHRASE_ETEINT as PHRASE_COMMANDES_ETEINTES } from "@/commandes/regles";
import { commandesAllumees, proposerAuStudio } from "@/commandes/service";
import { ajouterJours, lundiDe } from "@/calendrier/regles";
import { interrupteurAllume, journaliser } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { appelerStudio, lireOccupesDuStudio } from "@/passerelles/studio";
import { lireReglagesTirage, lireQuotas } from "@/reglages";
import type { Reseau } from "@/contrats";
import {
  INTERRUPTEUR_PLANIFICATION,
  PHRASE_ARRET,
  PHRASE_ETEINT,
  PHRASE_PAS_BRANCHE,
  PHRASE_SANS_OCCUPES,
  corpsDeProposition,
  jourParis,
  lireOccupes,
  programmationAcceptee,
  proposerSemaine,
  type LigneSemaine,
} from "./regles";

export * from "./regles";

export const planificationAllumee = () => interrupteurAllume(INTERRUPTEUR_PLANIFICATION);

export interface ResultatSemaine {
  message: string;
  proposees: number;
  envoyees: number;
  reportees: number;
  /** Les contenus restés sans jour, avec la raison (affichés sur l'écran « Ma semaine »). */
  listeReportees: { ligne: string; raison: string }[];
}
const vide = (message: string): ResultatSemaine => ({ message, proposees: 0, envoyees: 0, reportees: 0, listeReportees: [] });

interface LigneBase {
  id: string;
  reseau: Reseau;
  compte: string | null;
  type_contenu: string;
  prevue_le: Date;
  etat: string;
  date_choisie: boolean;
  commandee: boolean;
  /** Brouillon, pas encore au Studio, dans l'avenir : seule une telle ligne peut être déplacée. */
  deplacable: boolean;
}

/** Le lundi de la semaine visée : celle de la date donnée ; sans date, la semaine en cours, sauf le dimanche où c'est la suivante (jamais une semaine passée). */
export async function lundiVise(jour?: string): Promise<string> {
  const [{ j }] = await requete<{ j: string }>(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS j`);
  const dimanche = new Date(`${j}T12:00:00Z`).getUTCDay() === 0;
  const defaut = dimanche ? ajouterJours(j, 1) : j;
  return lundiDe(jour && /^\d{4}-\d{2}-\d{2}$/.test(jour) ? (jour < j ? defaut : jour) : defaut);
}

/**
 * Propose la semaine du `lundi` : (1) lit les créneaux pris du Studio AVANT tout ; (2) tire les jours par défaut des lignes
 * sans jour fixé ; (3) propose chaque ligne au Studio (appel 1) puis son créneau (appel 4, origine « usine », « à valider »).
 * Rejouable sans doublon (clés stables côté Studio) ; un jour choisi par le fondateur ne bouge jamais ; « Tout arrêter » : aucun appel.
 */
export async function proposerLaSemaine(lundi: string): Promise<ResultatSemaine> {
  if (!(await planificationAllumee())) return vide(PHRASE_ETEINT);
  // Interrupteur des échanges éteint : rien ne part, donc rien ne bouge (ni lecture, ni tirage, ni écriture).
  if (!(await commandesAllumees())) return vide(PHRASE_COMMANDES_ETEINTES);
  const maintenant = new Date();
  const fin = ajouterJours(lundi, 6);

  // 1. Les créneaux déjà pris, lus avant toute proposition (appel 7). Sans lecture claire, rien n'est proposé.
  const lecture = await sousArret("commande", () => lireOccupesDuStudio(lundi, fin)).catch(() => null);
  if (lecture === null) return vide(PHRASE_SANS_OCCUPES);
  if (!lecture.fait) return vide(PHRASE_ARRET);
  if (!lecture.valeur.envoye) return vide(PHRASE_PAS_BRANCHE);
  const occupes = lireOccupes(lecture.valeur.statut, lecture.valeur.corps);
  if (!occupes) return vide(PHRASE_SANS_OCCUPES);

  // 2. Le tirage (sans IA), puis l'écriture des jours par défaut : jamais sur une ligne au jour choisi ni déjà proposée.
  const [{ rythmes }, quotas] = await Promise.all([lireReglagesTirage(), lireQuotas()]);
  const { reportees, aEnvoyer } = await transaction(async () => {
    await requete(`SELECT pg_advisory_xact_lock(hashtext('planification-semaine'))`);
    const lignes = await requete<LigneBase>(
      `SELECT c.id::text, c.reseau, c.compte, c.type_contenu, c.prevue_le, c.etat, c.date_choisie,
              (c.etat = 'brouillon' AND (c.etat_studio IS NULL OR c.etat_studio = 'en_attente') AND c.prevue_le > now()) AS deplacable,
              EXISTS (SELECT 1 FROM commande_studio s WHERE s.calendrier_ligne = c.id AND s.archive_le IS NULL AND s.etat_envoi IN ('envoyee', 'mise_de_cote_studio')) AS commandee
         FROM calendrier_ligne c
        WHERE c.archive_le IS NULL AND c.etat <> 'echec' AND (c.prevue_le AT TIME ZONE 'Europe/Paris')::date BETWEEN $1::date AND $2::date
        ORDER BY c.id`,
      [lundi, fin],
    );
    const semaine: LigneSemaine[] = lignes.map((l) => ({
      id: l.id,
      reseau: l.reseau,
      compte: l.compte,
      type_contenu: l.type_contenu,
      instant: l.prevue_le,
      fixe: l.date_choisie || l.commandee || !l.deplacable,
    }));
    const tirage = proposerSemaine({ lundi, lignes: semaine, rythmes, quotas, occupes, maintenant });
    for (const p of tirage.propositions) {
      await requete(`UPDATE calendrier_ligne SET prevue_le = $2, modifie_le = now() WHERE id = $1 AND date_choisie = false AND archive_le IS NULL
            AND etat = 'brouillon' AND (etat_studio IS NULL OR etat_studio = 'en_attente') AND prevue_le > now()`, [p.ligne, p.instant]);
    }
    const proposes = new Set(tirage.propositions.map((p) => p.ligne));
    // À envoyer : les lignes tirées maintenant et celles déjà commandées en brouillon (rejeu : le Studio répond « déjà », sans doublon).
    // Jamais une date choisie par le fondateur (l'appel 4 ne porte que la date par défaut de l'Usine), jamais une ligne programmée ou publiée.
    const ids = lignes.filter((l) => !l.date_choisie && (proposes.has(l.id) || (l.commandee && l.etat === "brouillon"))).map((l) => l.id);
    return { reportees: tirage.reportees, aEnvoyer: ids };
  });

  // 3. L'envoi : commande (appel 1) puis créneau (appel 4). Chaque ligne seule ; un arrêt coupe tout.
  let envoyees = 0;
  for (const id of aEnvoyer) {
    const commande = await proposerAuStudio(id);
    if (commande.etat_envoi !== "envoyee") continue;
    const [l] = await requete<{ reseau: string; compte: string | null; type_contenu: string; prevue_le: Date }>(
      `SELECT reseau, compte, type_contenu, prevue_le FROM calendrier_ligne WHERE id = $1 AND archive_le IS NULL`,
      [id],
    );
    if (!l) continue;
    const corps = corpsDeProposition(cleCommande(id), { reseau: l.reseau, compte: l.compte, type_contenu: l.type_contenu, instant: l.prevue_le }, new Date());
    if (!corps) continue;
    const r = await sousArret("commande", () => appelerStudio(`usine/commandes/${cleCommande(id)}/programmations`, corps)).catch(() => null);
    if (r === null || !r.fait) {
      if (r && !r.fait) return { ...vide(PHRASE_ARRET), proposees: aEnvoyer.length, envoyees };
      continue;
    }
    if (r.valeur.envoye && programmationAcceptee(r.valeur.statut, r.valeur.corps)) envoyees += 1;
  }
  await journaliser("calendrier", "La semaine a été proposée au Studio.", { cible: `semaine:${lundi}`, donnees: { jour: jourParis(maintenant), envoyees, reportees: reportees.length } });
  const message =
    envoyees === 0
      ? "Rien n'est parti vers le Studio : vérifiez qu'il est branché et que ses lignes ont un compte."
      : `${envoyees} ${envoyees === 1 ? "jour proposé" : "jours proposés"} au Studio, à valider là-bas.${reportees.length > 0 ? ` ${reportees.length} ${reportees.length === 1 ? "contenu reste" : "contenus restent"} sans jour : voir la liste.` : ""}`;
  return { message, proposees: aEnvoyer.length, envoyees, reportees: reportees.length, listeReportees: reportees };
}
