/**
 * SCC-2 · Second code par courriel, côté base. Ni session ni cookie ici (branchement à la connexion : PR suivante).
 * - Code à 8 chiffres (`randomInt`), valable 10 min, gardé HACHÉ (HMAC-SHA-256, chiffrement.ts), comparé en temps constant.
 *   Jamais le code ni le texte du message en base ou au journal. Un seul code actif à la fois (en émettre un archive le précédent).
 * - Rattaché à la session partielle qui l'a demandé (empreinte du jti) : un code demandé ailleurs ne sert pas.
 * - 3 essais faux sur un code = code archivé ; chaque essai faux compte aussi au compteur du compte (`sousLimite`, 027).
 * - Envois comptés en base pour tout le compte : 60 s entre deux, 5 par heure, 10 par 24 h (les envois ratés comptent).
 * - Le code de connexion exige l'interrupteur « connexion.second-code-courriel » allumé ; celui de mise en service non
 *   (l'essai réussi est ce qui l'allume). L'adresse qui reçoit (USINE_COURRIEL_SECOND_CODE) ne vient que du serveur.
 * - Journal : phrases fixes seulement, jamais l'adresse, le code, ni la réponse du fournisseur.
 * - Tous les refus de vérification donnent le même message (code faux, expiré, utilisé, d'une autre session, absent).
 */
import { randomInt, timingSafeEqual } from "node:crypto";
import { journaliser } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { courrielConfigure, envoyerCourriel } from "@/passerelles/courriel";
import { empreinte, empreinteCodeCourriel } from "./chiffrement";
import { INTERRUPTEUR_SECOND_CODE } from "./exigence";
import { sousLimite } from "./second-code";

export const INTERRUPTEUR_COURRIEL = "connexion.second-code-courriel";
export type ButCode = "connexion" | "mise_en_service";

export const DUREE_CODE_MIN = 10;
export const ESSAIS_PAR_CODE = 3;
export const ATTENTE_RENVOI_S = 60;
export const ENVOIS_PAR_HEURE = 5;
export const ENVOIS_PAR_JOUR = 10;

export const MESSAGE_CODE_REFUSE = "Code incorrect ou expiré. Demandez-en un nouveau si besoin.";
export const MESSAGE_ENVOI_IMPOSSIBLE = "Le code n'a pas pu partir. Réessayez dans une minute.";
export const MESSAGE_TROP_DE_CODES = "Trop de codes demandés. Réessayez plus tard.";
export const MESSAGE_NON_REGLE = "L'envoi de courriel n'est pas encore réglé sur le serveur.";
const MESSAGE_ETEINT = "Le second code par courriel n'est pas allumé.";
const MESSAGE_TOTP_ALLUME = "Éteignez d'abord « Second code à la connexion ».";

type Echec = { ok: false; message: string };

const empreinteSession = (jti: string) => empreinte(`jeton:${jti}`);

function codeAleatoire(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

async function allume(code: string): Promise<boolean> {
  const [r] = await requete<{ allume: boolean }>("SELECT allume FROM interrupteur WHERE code = $1 AND archive_le IS NULL", [code]);
  return r?.allume === true;
}

/**
 * Émet un code pour la session partielle `jti` et l'envoie à l'adresse du serveur. Rend `{ ok: true }` ou un message
 * qui ne révèle ni l'adresse, ni le fournisseur, ni le statut.
 */
export async function emettreCode(but: ButCode, jti: string): Promise<{ ok: true } | Echec> {
  const destinataire = process.env.USINE_COURRIEL_SECOND_CODE ?? "";
  if (!courrielConfigure() || !destinataire) return { ok: false, message: MESSAGE_NON_REGLE };
  if (but === "connexion" && !(await allume(INTERRUPTEUR_COURRIEL))) return { ok: false, message: MESSAGE_ETEINT };

  const code = codeAleatoire();
  const emission = await transaction<{ ok: true; id: string } | Echec>(async () => {
    await requete("SELECT 1 FROM second_code_essais WHERE id = 1 FOR UPDATE"); // un seul envoi à la fois pour le compte
    const [n] = await requete<{ minute: number; heure: number; jour: number }>(
      `SELECT count(*) FILTER (WHERE cree_le > now() - make_interval(secs => $1))::int AS minute,
              count(*) FILTER (WHERE cree_le > now() - interval '1 hour')::int AS heure,
              count(*)::int AS jour
         FROM second_code_courriel WHERE cree_le > now() - interval '24 hours'`,
      [ATTENTE_RENVOI_S],
    );
    if (n.minute > 0 || n.heure >= ENVOIS_PAR_HEURE || n.jour >= ENVOIS_PAR_JOUR) return { ok: false, message: MESSAGE_TROP_DE_CODES };
    await requete("UPDATE second_code_courriel SET archive_le = now() WHERE utilise_le IS NULL AND archive_le IS NULL");
    const [l] = await requete<{ id: string }>(
      `INSERT INTO second_code_courriel (but, session, empreinte_code, expire_le)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING id::text AS id`,
      [but, empreinteSession(jti), empreinteCodeCourriel(code), DUREE_CODE_MIN],
    );
    return { ok: true, id: l.id };
  });
  if (!emission.ok) return emission;

  const r = await envoyerCourriel(
    destinataire,
    "Votre code Usine Axion",
    `Votre code : ${code}\nIl vaut ${DUREE_CODE_MIN} minutes.\nSi ce n'est pas vous, changez votre mot de passe.`,
  );
  if (!r.envoye) {
    await requete("UPDATE second_code_courriel SET archive_le = now() WHERE id = $1 AND archive_le IS NULL", [emission.id]);
    await journaliser("connexion", `Envoi du code impossible (statut ${r.statut}).`);
    return { ok: false, message: MESSAGE_ENVOI_IMPOSSIBLE };
  }
  await journaliser("connexion", "Code de connexion envoyé.");
  return { ok: true };
}

function memeEmpreinte(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Vérifie le code saisi pour la session partielle `jti`. Un succès marque le code utilisé. Un échec compte pour le
 * code (3 = archivé) et pour le compteur du compte (`sousLimite`). Même message pour tous les refus.
 */
export async function verifierCode(but: ButCode, code: string, jti: string): Promise<{ ok: true } | Echec> {
  return sousLimite<{ ok: true }>(async () => {
    const [l] = await requete<{ id: string; empreinte_code: string; essais: number }>(
      `SELECT id::text AS id, empreinte_code, essais FROM second_code_courriel
        WHERE session = $1 AND but = $2 AND utilise_le IS NULL AND archive_le IS NULL AND expire_le > now() FOR UPDATE`,
      [empreinteSession(jti), but],
    );
    if (!l) return { ok: false, message: MESSAGE_CODE_REFUSE };
    const saisi = code.replace(/\s/g, "");
    if (/^[0-9]{8}$/.test(saisi) && memeEmpreinte(empreinteCodeCourriel(saisi), l.empreinte_code)) {
      await requete("UPDATE second_code_courriel SET utilise_le = now() WHERE id = $1", [l.id]);
      await journaliser("connexion", "Code de connexion accepté.");
      return { ok: true };
    }
    await requete("UPDATE second_code_courriel SET essais = essais + 1, archive_le = CASE WHEN essais + 1 >= $2 THEN now() ELSE archive_le END WHERE id = $1", [
      l.id,
      ESSAIS_PAR_CODE,
    ]);
    return { ok: false, message: MESSAGE_CODE_REFUSE };
  });
}

/**
 * Mise en service : sur le bon code de type `mise_en_service`, UNE transaction crée la mise en service confirmée
 * (la précédente est archivée), allume l'interrupteur et écrit au journal. Refusée si le second code par
 * application est allumé. Rend l'identifiant de la mise en service (le futur champ `scm` du jeton, PR suivante).
 */
export async function mettreEnService(code: string, jti: string): Promise<{ ok: true; id: string } | Echec> {
  return transaction<{ ok: true; id: string } | Echec>(async () => {
    if (await allume(INTERRUPTEUR_SECOND_CODE)) return { ok: false, message: MESSAGE_TOTP_ALLUME };
    const v = await verifierCode("mise_en_service", code, jti);
    if (!v.ok) return v;
    await requete("UPDATE second_code_courriel_service SET archive_le = now() WHERE archive_le IS NULL");
    const [s] = await requete<{ id: string }>("INSERT INTO second_code_courriel_service (confirme_le) VALUES (now()) RETURNING id::text AS id");
    await requete("UPDATE interrupteur SET allume = true WHERE code = $1 AND archive_le IS NULL", [INTERRUPTEUR_COURRIEL]);
    await journaliser("interrupteur", "Second code par courriel : allumé.", { cible: INTERRUPTEUR_COURRIEL });
    return { ok: true, id: s.id };
  });
}
