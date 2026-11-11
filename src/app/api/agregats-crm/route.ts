/**
 * Route ENTRANTE des chiffres agrégés du CRM Pro (contrat de la PR #418 du CRM) : POST = les chiffres d'UN jour (UTC),
 * GET = les jours déjà reçus (≤ 7). Le proxy la laisse passer (PUBLICS) : cette route est donc sa propre garde.
 * Ordre : secret absent ou < 32 caractères → 404 ;
 * filtre IP : liste vide ou adresse hors liste → 403 (échec fermé, avant toute lecture en base) ; interrupteur
 * `agregats.recepteur` éteint → 404 (rien n'est lu ni écrit, et seulement après le filtre IP) ; en-têtes signés absents, mal formés ou horodatage hors
 * ±5 min → 401 (sans lire le corps) ; POST : type et taille → 415/413, corps lu par morceaux (128 Ko au plus) ; HMAC en temps
 * constant, nonce déjà vu → 401 ; schéma zod strict, fenêtre des jours UTC → 400 ; `genere_le` plus ancien → 409 ; égal → 200
 * sans effet. LIMITE : la HMAC couvre le corps, qu'on ne lit qu'une fois type et taille vérifiés ; un appelant aux en-têtes
 * bien formés mais à la signature fausse peut donc encore recevoir 415/413 (aucune donnée n'est révélée).
 * Le journal ne garde que l'issue : jamais l'en-tête, la signature, le secret ni le corps. Aucun appel sortant.
 */
import { GenereLeAncien, enregistrerPush, joursRecus, noterNonce } from "@/agregats";
import { recepteurAllume } from "@/agregats/interrupteur";
import { TAILLE_MAX_CORPS_AGREGATS, TOLERANCE_HORODATAGE_S, VARIABLE_AGREGATS_IPS, jourDansFenetre, jourUtcDe, schemaPush } from "@/agregats/regles";
import { horodatageAcceptable, lireEnTetes, secretAgregats, signatureValide, type Methode } from "@/agregats/signature";
import { adresseDepuisEntetes } from "@/lib/mot-de-passe";
import { CorpsTropGrand, lireCorpsLimite } from "@/agregats/corps";
import { ErreurPorte, json } from "@/porte/http";

const noter = (issue: string) => console.info(`[agregats] ${issue}`);
const refus401 = () => {
  noter("401");
  return json({ erreur: "Accès refusé." }, 401);
};

async function traiter(requete: Request, methode: Methode): Promise<Response> {
  const secret = secretAgregats();
  if (!secret) return json({ erreur: "Introuvable." }, 404);

  // Filtre IP OBLIGATOIRE : liste vide = refus (échec fermé), adresse hors liste = refus. La HMAC reste en plus.
  const permises = (process.env[VARIABLE_AGREGATS_IPS] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!permises.includes(adresseDepuisEntetes(requete.headers))) {
    noter("403");
    return json({ erreur: "Accès refusé." }, 403);
  }

  // Interrupteur lu seulement APRÈS le filtre IP : un inconnu ne déclenche aucune requête en base.
  if (!(await recepteurAllume())) return json({ erreur: "Introuvable." }, 404);

  // Refus 401 sans lire le corps pour qui n'a pas des en-têtes signés bien formés et récents.
  const entetes = lireEnTetes(requete.headers);
  if (!entetes || !horodatageAcceptable(entetes.horodatage)) return refus401();

  try {
    let texte = "";
    if (methode === "POST") {
      if (!(requete.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        throw new ErreurPorte(415, "type_invalide", "Le corps doit être en application/json.");
      }
      if (Number(requete.headers.get("content-length")) > TAILLE_MAX_CORPS_AGREGATS) {
        throw new ErreurPorte(413, "corps_trop_grand", "Corps trop grand.");
      }
      try {
        texte = await lireCorpsLimite(requete, TAILLE_MAX_CORPS_AGREGATS);
      } catch (e) {
        if (e instanceof CorpsTropGrand) throw new ErreurPorte(413, "corps_trop_grand", "Corps trop grand.");
        throw e;
      }
    }

    const chemin = new URL(requete.url).pathname;
    if (!signatureValide(secret, methode, chemin, entetes, texte)) return refus401();
    if (!(await noterNonce(entetes.nonce))) return refus401();

    if (methode === "GET") {
      noter("200 jours");
      return json({ jours: await joursRecus() });
    }

    let brut: unknown;
    try {
      brut = JSON.parse(texte);
    } catch {
      throw new ErreurPorte(400, "json_illisible", "Corps JSON illisible.");
    }
    const lu = schemaPush.safeParse(brut);
    if (!lu.success) {
      // Seulement les chemins et les messages de zod : jamais les valeurs reçues.
      const champs = lu.error.issues.map((i) => `${i.path.join(".") || "(corps)"} : ${i.message}`).slice(0, 10);
      throw new ErreurPorte(400, "demande_invalide", `Demande invalide. ${champs.join(" ; ")}`);
    }
    // Seuls les jours de [aujourd'hui − 7 ; veille] (UTC) sont reçus.
    if (!jourDansFenetre(lu.data.jour, jourUtcDe(Date.now()))) {
      throw new ErreurPorte(400, "jour_hors_fenetre", "jour : hors des 7 derniers jours (la veille et les six avant).");
    }
    // Un `genere_le` dans le futur bloquerait les envois suivants (il doit rester monotone) : refusé.
    if (Date.parse(lu.data.genere_le) > Date.now() + TOLERANCE_HORODATAGE_S * 1000) {
      throw new ErreurPorte(400, "genere_le_futur", "genere_le : date dans le futur.");
    }

    let ajoutees: number;
    try {
      ajoutees = await enregistrerPush(lu.data);
    } catch (e) {
      if (e instanceof GenereLeAncien) throw new ErreurPorte(409, "genere_le_ancien", "genere_le plus ancien que celui déjà reçu.");
      throw e;
    }
    noter(`200 ${ajoutees} ligne(s)`);
    return json({ recu: true });
  } catch (e) {
    if (e instanceof ErreurPorte) {
      noter(`${e.statut} ${e.code}`);
      return json({ erreur: e.message, code: e.code }, e.statut);
    }
    noter("500");
    // Seulement le nom de l'erreur : un message peut citer une valeur.
    console.error("[agregats]", e instanceof Error ? e.name : "erreur");
    return json({ erreur: "Erreur du serveur." }, 500);
  }
}

export const POST = (requete: Request): Promise<Response> => traiter(requete, "POST");
export const GET = (requete: Request): Promise<Response> => traiter(requete, "GET");
