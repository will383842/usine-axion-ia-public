/**
 * Passerelle sortante du courriel (second code). UNE requête HTTPS POST, vers l'hôte officiel du fournisseur choisi par
 * COURRIEL_FOURNISSEUR : « zeptomail » (hôte api.zeptomail.com, le seul que la documentation publique de ZeptoMail cite) ou
 * « brevo ». Variable absente ou inconnue, clé ou expéditeur absent : AUCUN envoi, aucun appel. Aucun hôte régional (.eu…)
 * n'est gardé : aucune documentation consultable ne le confirme ; il s'ajoutera, avec sa source, le jour où elle existera. Délai de 10 s, redirections refusées.
 * Rend `{ envoye, statut }` (statut 0 : rien parti ou pas de réponse) ; le corps de la réponse n'est jamais lu ni noté
 * (il peut contenir l'adresse). Cette passerelle ne lit pas l'interrupteur : l'essai de mise en service doit pouvoir
 * envoyer avant l'allumage ; l'appelant (src/auth/courriel.ts) exige l'interrupteur pour le code de connexion.
 * Formats : ZeptoMail POST /v1.1/email, en-tête Authorization « Zoho-enczapikey <jeton> », corps
 * { from, to: [{ email_address }], subject, textbody } ; Brevo POST /v3/smtp/email, en-tête api-key, corps
 * { sender, to, subject, textContent }.
 */
import "server-only";

export const HOTE_ZEPTOMAIL_COM = "https://api.zeptomail.com";
export const HOTE_BREVO = "https://api.brevo.com";

const DELAI_MS = 10_000;
const PREFIXE_ZEPTOMAIL = "Zoho-enczapikey ";

export interface ReponseCourriel {
  envoye: boolean;
  statut: number;
}
const RIEN: ReponseCourriel = { envoye: false, statut: 0 };

/** Fournisseur et région réglés (sans rien lire d'autre) ; `null` : aucun envoi. */
export function fournisseurCourriel(): "zeptomail" | "brevo" | null {
  const f = (process.env.COURRIEL_FOURNISSEUR ?? "").trim().toLowerCase();
  return f === "brevo" || f === "zeptomail" ? f : null;
}

/** L'envoi est-il réglé sur le serveur (fournisseur, clé, expéditeur) ? Ne montre aucune valeur. */
export function courrielConfigure(): boolean {
  return fournisseurCourriel() !== null && (process.env.COURRIEL_CLE_API ?? "").length > 0 && (process.env.COURRIEL_EXPEDITEUR ?? "").length > 0;
}

/** Envoie un courriel en texte brut. Rien ne part (`{ envoye: false, statut: 0 }`) si l'envoi n'est pas réglé. */
export async function envoyerCourriel(destinataire: string, objet: string, texte: string): Promise<ReponseCourriel> {
  const fournisseur = fournisseurCourriel();
  const cle = process.env.COURRIEL_CLE_API ?? "";
  const expediteur = process.env.COURRIEL_EXPEDITEUR ?? "";
  if (fournisseur === null || !cle || !expediteur || !destinataire) return RIEN;
  try {
    if (fournisseur === "brevo") {
      const corps = JSON.stringify({ sender: { email: expediteur }, to: [{ email: destinataire }], subject: objet, textContent: texte });
      const r = await fetch(`${HOTE_BREVO}/v3/smtp/email`, {
        method: "POST",
        headers: { "api-key": cle, accept: "application/json", "content-type": "application/json" },
        body: corps,
        signal: AbortSignal.timeout(DELAI_MS),
        redirect: "error",
      });
      return { envoye: r.ok, statut: r.status };
    }
    const jeton = cle.startsWith(PREFIXE_ZEPTOMAIL) ? cle : `${PREFIXE_ZEPTOMAIL}${cle}`;
    const corps = JSON.stringify({ from: { address: expediteur }, to: [{ email_address: { address: destinataire } }], subject: objet, textbody: texte });
    const entetes = { authorization: jeton, accept: "application/json", "content-type": "application/json" };
    const r = await fetch(`${HOTE_ZEPTOMAIL_COM}/v1.1/email`, { method: "POST", headers: entetes, body: corps, signal: AbortSignal.timeout(DELAI_MS), redirect: "error" });
    return { envoye: r.ok, statut: r.status };
  } catch {
    return RIEN;
  }
}
