/** U-COMMANDE · proposer une ligne du calendrier au Studio (appel 1), relire les états (appel 2). Éteint par défaut. */
import "server-only";
import { depots, interrupteurAllume, journaliser, type CommandeStudio } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { alerteQuota, lireQuotas, TYPES_QUOTA, type Palier, type TypeQuota } from "@/reglages";
import { envoyerCommande, lireCommande, type ResultatAppel } from "./client";
import {
  INTERRUPTEUR_COMMANDES,
  LECTURES_MAX,
  PHRASE_ARRET,
  PHRASE_ETEINT,
  PHRASE_INTROUVABLE_CHEZ_STUDIO,
  PHRASE_PAS_BRANCHE,
  PHRASE_SANS_REPONSE,
  cleCommande,
  corpsDeLigne,
  lireReponseCommande,
  lireReponseLecture,
  type IssueEnvoi,
  type LigneAProposer,
} from "./regles";

export const commandesAllumees = () => interrupteurAllume(INTERRUPTEUR_COMMANDES);

export interface ResultatProposition {
  message: string;
  etat_envoi: CommandeStudio["etat_envoi"] | null;
}

function issueSansReponse(r: Exclude<ResultatAppel, { genre: "reponse" }>): IssueEnvoi {
  const message = r.genre === "arret" ? PHRASE_ARRET : r.genre === "pas_branche" ? PHRASE_PAS_BRANCHE : PHRASE_SANS_REPONSE;
  return { etat_envoi: "non_envoyee", etat_studio: null, message };
}

const MOTS_DEJA_PROPOSEE: Record<string, string> = {
  envoyee: "Déjà proposée au Studio.",
  mise_de_cote_studio: "Déjà proposée : le Studio l'a mise de côté.",
};

/** Propose une ligne du calendrier au Studio. Rejouable : une même ligne ne donne jamais deux commandes ni deux appels réussis. */
export async function proposerAuStudio(calendrierLigneId: string): Promise<ResultatProposition> {
  if (!(await commandesAllumees())) return { message: PHRASE_ETEINT, etat_envoi: null };
  if (!/^\d+$/.test(calendrierLigneId)) return { message: "Cette ligne n'existe plus.", etat_envoi: null };
  const [ligne] = await requete<LigneAProposer>(
    `SELECT id::text, reseau, compte, type_contenu, prevue_le, lot_ligne FROM calendrier_ligne WHERE id = $1 AND archive_le IS NULL`,
    [calendrierLigneId],
  );
  if (!ligne) return { message: "Cette ligne n'existe plus.", etat_envoi: null };
  const corps = corpsDeLigne(ligne, new Date());
  if (!corps.ok) return { message: corps.phrase, etat_envoi: null };
  const cle = cleCommande(ligne.id);

  // Une transaction verrouille la ligne : deux gestes simultanés se suivent, le second voit « envoyee » et n'appelle pas.
  return transaction(async () => {
    await requete(
      `INSERT INTO commande_studio (cle, calendrier_ligne, lot_ligne, repere, reseau, compte, type_contenu, jour, instant)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (cle) DO NOTHING`,
      [cle, ligne.id, ligne.lot_ligne, corps.corps.repere ?? null, corps.corps.reseau, corps.corps.compteCible, ligne.type_contenu, corps.corps.jour, corps.corps.instant],
    );
    const [existante] = await requete<CommandeStudio>(`SELECT * FROM commande_studio WHERE cle = $1 FOR UPDATE`, [cle]);
    if (MOTS_DEJA_PROPOSEE[existante.etat_envoi]) return { message: MOTS_DEJA_PROPOSEE[existante.etat_envoi], etat_envoi: existante.etat_envoi };

    const reponse = await envoyerCommande(corps.corps);
    const issue = reponse.genre === "reponse" ? lireReponseCommande(reponse.statut, reponse.corps) : issueSansReponse(reponse);
    await requete(
      `UPDATE commande_studio SET etat_envoi = $2, etat_studio = coalesce($3, etat_studio), message = $4,
              envoyee_le = CASE WHEN $2::text = 'non_envoyee' THEN envoyee_le ELSE now() END, modifie_le = now() WHERE cle = $1`,
      [cle, issue.etat_envoi, issue.etat_studio, issue.message],
    );
    await journaliser("commande", issue.etat_envoi === "non_envoyee" ? "Une ligne du calendrier n'a pas pu être proposée au Studio." : "Une ligne du calendrier a été proposée au Studio.", {
      cible: cle,
      donnees: { reseau: corps.corps.reseau, etat: issue.etat_envoi },
    });
    return { message: issue.message, etat_envoi: issue.etat_envoi };
  });
}

/** Relit l'état des commandes proposées (les plus anciennes relectures d'abord, 20 au plus par passage). N'écrit que dans `commande_studio`. */
export async function relireDepuisStudio(max: number = LECTURES_MAX): Promise<{ relues: number; message: string }> {
  if (!(await commandesAllumees())) return { relues: 0, message: PHRASE_ETEINT };
  const limite = Math.min(Math.max(1, Math.trunc(max)), LECTURES_MAX);
  const lignes = await requete<{ cle: string }>(
    `SELECT cle FROM commande_studio WHERE etat_envoi IN ('envoyee', 'mise_de_cote_studio') AND archive_le IS NULL
      ORDER BY relue_le ASC NULLS FIRST, cle LIMIT $1`,
    [limite],
  );
  let relues = 0;
  let arret: string | null = null;
  for (const { cle } of lignes) {
    const r = await lireCommande(cle);
    if (r.genre !== "reponse") {
      arret = issueSansReponse(r).message;
      break;
    }
    if (r.statut === 404) {
      await requete(`UPDATE commande_studio SET message = $2, relue_le = now(), modifie_le = now() WHERE cle = $1`, [cle, PHRASE_INTROUVABLE_CHEZ_STUDIO]);
      continue;
    }
    const lu = lireReponseLecture(r.statut, r.corps);
    if (!lu) {
      await requete(`UPDATE commande_studio SET relue_le = now() WHERE cle = $1`, [cle]);
      continue;
    }
    await requete(
      `UPDATE commande_studio SET etat_studio = $2, valide_le = $3, refuse_le = $4, message = NULL,
              etat_envoi = CASE WHEN $2::text = 'mise_de_cote' THEN 'mise_de_cote_studio' ELSE 'envoyee' END, relue_le = now(), modifie_le = now() WHERE cle = $1`,
      [cle, lu.etat_studio, lu.valide_le, lu.refuse_le],
    );
    relues += 1;
  }
  if (arret) return { relues, message: arret };
  return { relues, message: relues === 0 ? "Rien de nouveau côté Studio." : `${relues} ${relues === 1 ? "commande mise à jour" : "commandes mises à jour"}.` };
}

/** Commandes proposées, indexées par ligne du calendrier (écran du calendrier ; RC-17 les lira aussi). */
export async function listerCommandes(): Promise<Map<string, CommandeStudio>> {
  const lignes = await requete<CommandeStudio>(`SELECT * FROM commande_studio WHERE archive_le IS NULL`);
  return new Map(lignes.map((c) => [String(c.calendrier_ligne), c]));
}

/** Palier de quota de la semaine pour le réseau et le type de la ligne (affiché, jamais bloquant). */
export async function palierDeLigne(reseau: string, typeContenu: string, jour: string): Promise<{ palier: Palier; fait: number } | null> {
  if (!(TYPES_QUOTA as readonly string[]).includes(typeContenu)) return null;
  const quotas = await lireQuotas();
  const quota = quotas[reseau as keyof typeof quotas]?.[typeContenu as TypeQuota];
  if (!quota) return null;
  const [r] = await requete<{ n: string }>(
    `SELECT count(*) AS n FROM commande_studio
      WHERE archive_le IS NULL AND etat_envoi IN ('envoyee', 'mise_de_cote_studio') AND reseau = $1 AND type_contenu = $2
        AND ($4::text = 'jour' AND jour = $3::date OR $4::text = 'semaine' AND date_trunc('week', jour) = date_trunc('week', $3::date))`,
    [reseau, typeContenu, jour, quota.periode],
  );
  const fait = Number(r?.n ?? 0);
  return { palier: alerteQuota(quota, fait), fait };
}
