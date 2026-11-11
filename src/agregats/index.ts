/**
 * L3d · Chiffres agrégés du CRM : enregistrement en AJOUT SEUL, lecture de la ligne la plus récente, retard.
 * Rien n'est supprimé ni remplacé : un renvoi ajoute des lignes portant un `genere_le` plus récent. Aucune donnée de personne.
 */
import "server-only";
import { aujourdhuiParis } from "@/chiffres";
import { ajouterJours } from "@/chiffres/regles";
import { requete, transaction } from "@/lib/base";
import { JOURS_RENDUS, enRetardParCompte, jourUtcDe, masquerLigne, type PushAgregats } from "./regles";

export class GenereLeAncien extends Error {}

/** Note le nonce et dit s'il est neuf. Les nonces restent sans fin et sans condition de temps : un nonce déjà vu est toujours refusé, quelle que soit l'horloge. */
export async function noterNonce(nonce: string): Promise<boolean> {
  return transaction(async () => {
    await requete("SELECT pg_advisory_xact_lock(hashtext($1))", [nonce]);
    const vu = await requete(`SELECT 1 FROM agregat_crm_nonce WHERE nonce = $1 LIMIT 1`, [nonce]);
    if (vu.length) return false;
    await requete("INSERT INTO agregat_crm_nonce (nonce) VALUES ($1)", [nonce]);
    return true;
  });
}

/**
 * Ajoute les lignes du push. Par (jour, réseau, compte) : `genere_le` plus ancien que le dernier reçu → GenereLeAncien (rien n'est
 * écrit) ; égal → ignoré (2xx sans effet) ; plus récent ou neuf → lignes ajoutées. Rend le nombre de lignes ajoutées.
 */
export async function enregistrerPush(push: PushAgregats): Promise<number> {
  return transaction(async () => {
    await requete("SELECT pg_advisory_xact_lock(hashtext('agregat_crm'))");
    const cles = [...new Set(push.lignes.map((l) => `${l.jour}|${l.reseau}|${l.compte}`))];
    const aEcrire = new Set<string>();
    for (const cle of cles) {
      const [jour, reseau, compte] = cle.split("|");
      const [etat] = await requete<{ plus_recent: boolean; egal: boolean }>(
        `SELECT $3::timestamptz > genere_le AS plus_recent, $3::timestamptz = genere_le AS egal FROM agregat_crm_dernier WHERE jour = $1 AND reseau = $4 AND compte = $2`,
        [jour, compte, push.genere_le, reseau],
      );
      if (!etat || etat.plus_recent) aEcrire.add(cle);
      else if (!etat.egal) throw new GenereLeAncien();
    }
    let ajoutees = 0;
    for (const l of push.lignes) {
      if (!aEcrire.has(`${l.jour}|${l.reseau}|${l.compte}`)) continue;
      const m = masquerLigne(l);
      const r = await requete(
        `INSERT INTO agregat_crm (jour, compte, mot, reseau, demandes, guides_envoyes, accords, mises_a_l_ecart, genere_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (jour, reseau, compte, mot, genere_le) DO NOTHING RETURNING id`,
        [l.jour, l.compte, l.mot, l.reseau, m.demandes, m.guides, m.accords, m.mises_a_l_ecart, push.genere_le],
      );
      ajoutees += r.length;
    }
    for (const cle of aEcrire) {
      const [jour, reseau, compte] = cle.split("|");
      await requete(
        `INSERT INTO agregat_crm_dernier (jour, reseau, compte, genere_le) VALUES ($1, $2, $3, $4)
         ON CONFLICT (jour, reseau, compte) DO UPDATE SET genere_le = EXCLUDED.genere_le`,
        [jour, reseau, compte, push.genere_le],
      );
    }
    // Le jour est REÇU même sans ligne (tout masqué) : marqueur en ajout seul, rejouable sans effet.
    await requete("INSERT INTO agregat_crm_jour_recu (jour) VALUES ($1) ON CONFLICT (jour) DO NOTHING", [push.jour]);
    return ajoutees;
  });
}

/** Les jours reçus sur les 7 derniers jours UTC (la veille et les six avant), « AAAA-MM-JJ », du plus ancien au plus récent. */
export async function joursRecus(): Promise<string[]> {
  const aujourdhui = jourUtcDe(Date.now());
  const lignes = await requete<{ jour: string }>(
    `SELECT to_char(jour, 'YYYY-MM-DD') AS jour FROM (
       SELECT jour FROM agregat_crm UNION SELECT jour FROM agregat_crm_jour_recu
     ) j WHERE jour BETWEEN $1::date AND $2::date ORDER BY 1`,
    [ajouterJours(aujourdhui, -JOURS_RENDUS), ajouterJours(aujourdhui, -1)],
  );
  return lignes.map((l) => l.jour).slice(0, JOURS_RENDUS);
}

export interface AgregatLu {
  jour: string;
  compte: string;
  mot: string;
  reseau: string;
  demandes: number | null;
  guides_envoyes: number | null;
  accords: number | null;
  mises_a_l_ecart: number | null;
  genere_le: Date;
}

/** Lecture : par (jour, réseau, compte, mot), la ligne au `genere_le` le plus récent. Une valeur null est une cellule masquée (« <3 »). */
export async function lireAgregats(depuis: string, jusqua: string): Promise<AgregatLu[]> {
  return requete<AgregatLu>(
    `SELECT DISTINCT ON (jour, reseau, compte, mot) to_char(jour, 'YYYY-MM-DD') AS jour, compte, mot, reseau, demandes, guides_envoyes, accords, mises_a_l_ecart, genere_le
       FROM agregat_crm WHERE jour BETWEEN $1::date AND $2::date
      ORDER BY jour, reseau, compte, mot, genere_le DESC`,
    [depuis, jusqua],
  );
}

/**
 * Bandeau « chiffres du CRM en retard », calculé à l'affichage, PAR COMPTE : le compte dont le dernier jour reçu est le plus ancien décide.
 * Seuls les jours marqués dans `agregat_crm_jour_recu` SANS aucune ligne de chiffres (jours entièrement masqués, valables pour tous les comptes) comptent en plus : le marqueur d'un push ordinaire ne compte pas.
 */
export async function chiffresCrmEnRetard(): Promise<boolean> {
  const lignes = await requete<{ dernier: string }>(
    `SELECT to_char(GREATEST(max(a.jour), (SELECT max(r.jour) FROM agregat_crm_jour_recu r WHERE NOT EXISTS (SELECT 1 FROM agregat_crm x WHERE x.jour = r.jour))), 'YYYY-MM-DD') AS dernier FROM agregat_crm a GROUP BY a.reseau, a.compte`,
  );
  const marque = (await requete<{ dernier: string | null }>(`SELECT to_char(max(r.jour), 'YYYY-MM-DD') AS dernier FROM agregat_crm_jour_recu r WHERE NOT EXISTS (SELECT 1 FROM agregat_crm x WHERE x.jour = r.jour)`))[0]?.dernier;
  const derniers = lignes.length > 0 ? lignes.map((l) => l.dernier) : marque ? [marque] : [];
  return enRetardParCompte(derniers, await aujourdhuiParis());
}
