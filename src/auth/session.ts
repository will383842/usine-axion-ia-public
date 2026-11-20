/**
 * N-26 · Session complète = jeton valide (mot de passe en vigueur) QUI PORTE le téléphone vérifié (`sc`), et ce
 * téléphone est toujours celui enregistré, sans marque de session partielle (`etape`). Un jeton sans `sc` (mot de
 * passe seul, ou émis avant N-26) n'ouvre rien d'autre que /connexion. Une remise à zéro ou un code de secours archive le téléphone : toutes les sessions tombent.
 * SCC-3 : en mode courriel (src/auth/exigence.ts) c'est `scm` qui compte, pas `sc`.
 * Utilisé par src/proxy.ts et par exigerSession() (src/services/auth.ts). Base illisible : aucune session (échec fermé).
 */
import { requete } from "@/lib/base";
import { lireExigence } from "@/auth/exigence";
import { DUREE_PARTIELLE_SEC, verifierJeton, type ContenuJeton } from "@/lib/jeton-session";

/** L'identifiant du téléphone enregistré (confirmé, non archivé), ou null. */
export async function idSecondCodeActif(): Promise<string | null> {
  const [r] = await requete<{ id: string }>("SELECT id::text AS id FROM second_code WHERE confirme_le IS NOT NULL AND archive_le IS NULL");
  return r?.id ?? null;
}

export async function sessionComplete(jeton: string | undefined): Promise<ContenuJeton | null> {
  const contenu = await verifierJeton(jeton);
  if (!contenu || contenu.etape) return null;
  // U-SECOND-CODE-ETEINT : second code non exigé (interrupteur éteint) = le mot de passe seul vaut session complète.
  // Une lecture impossible vaut « exigé » : voir src/auth/exigence.ts.
  // SCC-3 : mode courriel = `scm` égal à la mise en service confirmée ; une session qui porte seulement `sc` tombe.
  try {
    const e = await lireExigence();
    if (e.mode === "aucun") return contenu;
    if (e.mode === "courriel") return contenu.scm && contenu.scm === e.service ? contenu : null;
    if (!contenu.sc) return null;
    return (await idSecondCodeActif()) === contenu.sc ? contenu : null;
  } catch {
    return null;
  }
}

/**
 * Session partielle : jeton valide marqué `etape: "mdp"`, sans `sc`, émis pour au plus DUREE_PARTIELLE_SEC. Un jeton
 * d'avant N-26 (ni `sc` ni `etape`) n'en est pas une : il ne permet ni d'enregistrer un téléphone, ni d'essayer un code.
 */
export async function sessionPartielle(jeton: string | undefined): Promise<ContenuJeton | null> {
  const c = await verifierJeton(jeton);
  if (!c || c.sc || c.scm || c.etape !== "mdp" || c.iat === undefined || c.exp === undefined) return null;
  return c.exp - c.iat <= DUREE_PARTIELLE_SEC ? c : null;
}
