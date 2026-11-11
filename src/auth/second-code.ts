/**
 * N-26 · Second code, côté base : enregistrer un téléphone, vérifier un code, utiliser un code de secours.
 * - Le secret est chiffré (chiffrement.ts) ; il n'est rendu qu'une fois, à sa création. En redemander un archive
 *   le précédent, jamais confirmé.
 * - Un code ne sert qu'une fois (`dernier_pas`). Codes de secours : 10, montrés une fois, gardés hachés (argon2id),
 *   chacun une fois ; en utiliser un archive le téléphone (nouvel enregistrement imposé) et le note dans
 *   `second_code_remise`.
 * - 5 essais faux de suite (code, premier code, code de secours confondus) = une attente pour tout le compte, gardée
 *   en base (un redémarrage ne l'efface pas) ; les essais passent un par un (verrou de ligne). L'attente s'allonge
 *   sur les paliers de suite (15 min, puis 1 h, puis 24 h) ; un succès la remet à 15 min. Dès 3 attentes de suite :
 *   carte d'alerte sur « Ma journée » et ligne au journal. Pas de compteur par adresse : un seul compte, un seul
 *   utilisateur ; l'attente globale et progressive couvre un attaquant qui change d'adresse.
 * - Remise à zéro par le serveur : fonction SQL `remettre_second_code` (migrations/027-second-code.sql). PROCÉDURE :
 *   1) CHANGER LE MOT DE PASSE d'abord (nouveau hachage : toutes les sessions, partielles comprises, tombent ; celui
 *   qui a fait échouer les codes connaît l'ancien) ; 2) puis la remise. Après une remise, seule une session partielle
 *   ouverte APRÈS elle peut enregistrer un téléphone (`enregistrementPermis`).
 * - Après un code de secours, seule la session partielle qui l'a utilisé (`jeton`, empreinte de son jti) enregistre
 *   le nouveau téléphone ; si elle a expiré (15 min), un autre code de secours du même téléphone en ouvre une neuve.
 * - Pas plus de 5 secrets tirés par heure (`preparerSecondCode`).
 * Limites connues, acceptées par défaut jusqu'à décision de Will : avec le mot de passe, 5 codes faux par palier
 * gardent le compte en attente (24 h au dernier palier) et les codes de secours sont refusés aussi pendant l'attente ;
 * la sortie est la procédure ci-dessus. L'alerte n'est visible que dans l'Usine (« Ma journée » et journal) : l'alerte
 * hors de l'Usine (Telegram ou e-mail) arrive avec N-13 (vague 8).
 * Rien du code, du secret ni des codes de secours n'est écrit au journal.
 */
import { hash, verify } from "@node-rs/argon2";
import { randomInt } from "node:crypto";
import { journaliser } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { REGLAGES_ARGON2 } from "@/lib/mot-de-passe";
import { chiffrer, dechiffrer, empreinte } from "./chiffrement";
import { idSecondCodeActif } from "./session";
import { genererSecret, lienApplication, trouverPas } from "./totp";

export const ESSAIS_MAX = 5;
/** Paliers d'attente de suite : 15 min, 1 h, puis 24 h (le dernier se répète). */
const PALIERS = [
  { intervalle: "15 minutes", message: "Trop d'essais. Réessayez dans 15 minutes." },
  { intervalle: "1 hour", message: "Trop d'essais. Réessayez dans 1 heure." },
  { intervalle: "24 hours", message: "Trop d'essais. Réessayez dans 24 heures." },
] as const;
export const TROP_D_ESSAIS = PALIERS[0].message;
const palier = (attentesDeSuite: number) => PALIERS[Math.min(Math.max(attentesDeSuite, 1), PALIERS.length) - 1];
/** À partir de ce nombre d'attentes de suite, l'Usine alerte Will (carte « Ma journée » et journal). */
export const ATTENTES_AVANT_ALERTE = 3;
const CODE_FAUX = "Code incorrect. Entrez le code affiché maintenant dans votre application.";
const SECOURS_FAUX = "Code de secours incorrect ou déjà utilisé.";
const DEJA_ENREGISTRE = "Un téléphone est déjà enregistré.";
/** Secrets tirés au plus par heure (archivés compris). */
export const SECRETS_PAR_HEURE = 5;
const TROP_DE_SECRETS = "Trop de secrets demandés. Réessayez dans 1 heure.";
const ENREGISTREMENT_REFUSE = "Entrez d'abord un code de secours, ou reconnectez-vous avec votre mot de passe.";

export const NOMBRE_SECOURS = 10;
const ALPHABET_SECOURS = "23456789abcdefghjkmnpqrstuvwxyz"; // ni 0, 1, i, l, o : rien à confondre
const LONGUEUR_SECOURS = 10;

type Echec = { ok: false; message: string };
interface LigneCode {
  id: string;
  secret_chiffre: string;
  dernier_pas: string | null;
}

export function genererCodesSecours(): string[] {
  const codes = new Set<string>();
  while (codes.size < NOMBRE_SECOURS) {
    const c = Array.from({ length: LONGUEUR_SECOURS }, () => ALPHABET_SECOURS[randomInt(ALPHABET_SECOURS.length)]).join("");
    codes.add(`${c.slice(0, 5)}-${c.slice(5)}`);
  }
  return [...codes];
}

/** Minuscules, sans espace ni tiret. */
export function normaliserSecours(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Carte « Ma journée » (une seule, rouverte si besoin) et ligne au journal : des codes faux reviennent. */
async function alerter(attentesDeSuite: number): Promise<void> {
  await requete(
    `INSERT INTO carte (cle, titre, detail, bouton, lien, urgence, origine)
     VALUES ('alerte:second-code', $1, $2, 'Changer mon mot de passe', '/reglages/mot-de-passe', 100, 'N-26')
     ON CONFLICT (cle) DO UPDATE SET titre = EXCLUDED.titre, detail = EXCLUDED.detail, fait_le = NULL, archive_le = NULL, modifie_le = now()`,
    [
      `Code du téléphone : ${attentesDeSuite} attentes de suite`,
      "Des codes faux ont été entrés après votre mot de passe. Si ce n'était pas vous, changez votre mot de passe.",
    ],
  );
  await journaliser("connexion", `Alerte : ${attentesDeSuite} attentes de suite sur le second code (codes faux répétés après le mot de passe).`);
}

/** Joue un essai sous le verrou de la limite : refusé pendant l'attente ; un échec compte, un succès remet à zéro. */
async function sousLimite<T extends { ok: true }>(essai: () => Promise<T | Echec>): Promise<T | Echec> {
  return transaction(async () => {
    const [e] = await requete<{ en_attente: boolean; attentes_de_suite: number }>(
      "SELECT coalesce(attente_jusqu_a > now(), false) AS en_attente, attentes_de_suite FROM second_code_essais WHERE id = 1 FOR UPDATE",
    );
    if (!e) throw new Error("Limite d'essais du second code absente.");
    if (e.en_attente) return { ok: false, message: palier(e.attentes_de_suite).message };
    const r = await essai();
    if (r.ok) {
      await requete("UPDATE second_code_essais SET echecs = 0, attente_jusqu_a = NULL, attentes_de_suite = 0 WHERE id = 1");
      return r;
    }
    const [x] = await requete<{ echecs: number }>("UPDATE second_code_essais SET echecs = echecs + 1 WHERE id = 1 RETURNING echecs");
    if (x.echecs < ESSAIS_MAX) return r;
    const attentes = e.attentes_de_suite + 1;
    const { intervalle, message } = palier(attentes);
    await requete("UPDATE second_code_essais SET echecs = 0, attentes_de_suite = $1, attente_jusqu_a = now() + $2::interval WHERE id = 1", [
      attentes,
      intervalle,
    ]);
    if (attentes >= ATTENTES_AVANT_ALERTE) await alerter(attentes);
    return { ok: false, message };
  });
}

async function codeActif(): Promise<LigneCode | null> {
  const [l] = await requete<LigneCode>(
    "SELECT id::text AS id, secret_chiffre, dernier_pas::text AS dernier_pas FROM second_code WHERE confirme_le IS NOT NULL AND archive_le IS NULL FOR UPDATE",
  );
  return l ?? null;
}

/** La session partielle qui demande à enregistrer un téléphone : son identifiant et sa date d'émission (s). */
export interface Partielle {
  jti: string;
  iat?: number;
}

/**
 * Cette session partielle peut-elle enregistrer un téléphone ? Oui sans remise passée (premier enregistrement) ;
 * après un code de secours, seulement la session qui l'a utilisé ; après une remise par le serveur, seulement une
 * session ouverte après elle.
 */
export async function enregistrementPermis(p: Partielle): Promise<boolean> {
  const [r] = await requete<{ moyen: string; jeton: string | null; apres: boolean }>(
    "SELECT moyen, jeton, to_timestamp($1::double precision) > faite_le AS apres FROM second_code_remise ORDER BY id DESC LIMIT 1",
    [p.iat ?? 0],
  );
  if (!r) return true;
  return r.moyen === "code_de_secours" ? r.jeton === empreinte(`jeton:${p.jti}`) : r.apres;
}

/** Tire un secret neuf pour un téléphone à enregistrer ; le rend une seule fois. Refusé si un téléphone est enregistré. */
export async function preparerSecondCode(partielle: Partielle): Promise<{ ok: true; secret: string; lien: string } | Echec> {
  return transaction(async () => {
    await requete("SELECT 1 FROM second_code_essais WHERE id = 1 FOR UPDATE");
    if (await idSecondCodeActif()) return { ok: false, message: DEJA_ENREGISTRE };
    if (!(await enregistrementPermis(partielle))) return { ok: false, message: ENREGISTREMENT_REFUSE };
    const [{ n }] = await requete<{ n: number }>("SELECT count(*)::int AS n FROM second_code WHERE cree_le > now() - interval '1 hour'");
    if (n >= SECRETS_PAR_HEURE) return { ok: false, message: TROP_DE_SECRETS };
    await requete("UPDATE second_code SET archive_le = now() WHERE confirme_le IS NULL AND archive_le IS NULL");
    const secret = genererSecret();
    await requete("INSERT INTO second_code (secret_chiffre) VALUES ($1)", [chiffrer(secret)]);
    return { ok: true, secret, lien: lienApplication(secret) };
  });
}

/** Premier code du téléphone en cours d'enregistrement : le confirme et rend les codes de secours (une seule fois). */
export async function confirmerSecondCode(
  code: string,
  partielle: Partielle,
  maintenant = Date.now(),
): Promise<{ ok: true; id: string; codesSecours: string[] } | Echec> {
  return sousLimite<{ ok: true; id: string; codesSecours: string[] }>(async () => {
    if (await idSecondCodeActif()) return { ok: false, message: DEJA_ENREGISTRE };
    if (!(await enregistrementPermis(partielle))) return { ok: false, message: ENREGISTREMENT_REFUSE };
    const [l] = await requete<LigneCode>(
      "SELECT id::text AS id, secret_chiffre FROM second_code WHERE confirme_le IS NULL AND archive_le IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE",
    );
    if (!l) return { ok: false, message: "Touchez d'abord « Montrer mon secret »." };
    const pas = trouverPas(dechiffrer(l.secret_chiffre), code, maintenant, null);
    if (pas === null) return { ok: false, message: CODE_FAUX };
    await requete("UPDATE second_code SET confirme_le = now(), dernier_pas = $2 WHERE id = $1", [l.id, pas]);
    const codesSecours = genererCodesSecours();
    for (const c of codesSecours) {
      await requete("INSERT INTO second_code_secours (second_code_id, hachage) VALUES ($1, $2)", [l.id, await hash(normaliserSecours(c), REGLAGES_ARGON2)]);
    }
    return { ok: true, id: l.id, codesSecours };
  });
}

/** Code de l'application pour le téléphone enregistré. */
export async function verifierSecondCode(code: string, maintenant = Date.now()): Promise<{ ok: true; id: string } | Echec> {
  return sousLimite<{ ok: true; id: string }>(async () => {
    const l = await codeActif();
    if (!l) return { ok: false, message: "Aucun téléphone n'est enregistré." };
    const pas = trouverPas(dechiffrer(l.secret_chiffre), code, maintenant, l.dernier_pas === null ? null : Number(l.dernier_pas));
    if (pas === null) return { ok: false, message: CODE_FAUX };
    await requete("UPDATE second_code SET dernier_pas = $2 WHERE id = $1", [l.id, pas]);
    return { ok: true, id: l.id };
  });
}

/**
 * Le téléphone archivé par le dernier code de secours, tant qu'aucun autre n'est enregistré : ses codes de secours
 * restants valent encore (la session qui en a utilisé un a pu expirer avant l'enregistrement).
 */
async function telephoneEnSecours(): Promise<{ id: string } | null> {
  const [l] = await requete<{ id: string }>(
    `SELECT r.second_code_id::text AS id FROM second_code_remise r
      WHERE r.id = (SELECT max(id) FROM second_code_remise) AND r.moyen = 'code_de_secours' AND r.second_code_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM second_code WHERE confirme_le IS NOT NULL AND archive_le IS NULL)`,
  );
  return l ?? null;
}

/**
 * Code de secours (téléphone perdu) : le consomme, archive le téléphone et note la remise, avec `session` = empreinte
 * (HMAC, clé du serveur) de l'appareil ou de l'adresse d'où elle vient, et `jeton` = empreinte du jti de la session
 * partielle qui l'a utilisé : elle seule enregistre le nouveau téléphone. N'ouvre pas de session.
 */
export async function utiliserCodeSecours(code: string, session: string | null, jti: string): Promise<{ ok: true } | Echec> {
  return sousLimite(async () => {
    const l = (await codeActif()) ?? (await telephoneEnSecours());
    if (!l) return { ok: false, message: SECOURS_FAUX };
    const saisi = normaliserSecours(code);
    if (saisi.length !== LONGUEUR_SECOURS) return { ok: false, message: SECOURS_FAUX };
    const restants = await requete<{ id: string; hachage: string }>(
      "SELECT id::text AS id, hachage FROM second_code_secours WHERE second_code_id = $1 AND utilise_le IS NULL ORDER BY id",
      [l.id],
    );
    let trouve: string | null = null;
    for (const r of restants) if ((await verify(r.hachage, saisi).catch(() => false)) && !trouve) trouve = r.id;
    if (!trouve) return { ok: false, message: SECOURS_FAUX };
    await requete("UPDATE second_code_secours SET utilise_le = now() WHERE id = $1", [trouve]);
    await requete("UPDATE second_code SET archive_le = now() WHERE id = $1 AND archive_le IS NULL", [l.id]);
    await requete(
      "INSERT INTO second_code_remise (moyen, demandee_par, second_code_id, session, jeton) VALUES ('code_de_secours', 'Will', $1, $2, $3)",
      [l.id, session, empreinte(`jeton:${jti}`)],
    );
    return { ok: true };
  });
}
