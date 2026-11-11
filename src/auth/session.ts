/**
 * N-26 · Session complète = jeton valide (mot de passe en vigueur) QUI PORTE le téléphone vérifié (`sc`), et ce
 * téléphone est toujours celui enregistré, sans marque de session partielle (`etape`). Un jeton sans `sc` (mot de
 * passe seul, ou émis avant N-26) n'ouvre rien d'autre que /connexion. Une remise à zéro ou un code de secours archive le téléphone : toutes les sessions tombent.
 * Utilisé par src/proxy.ts et par exigerSession() (src/services/auth.ts). Base illisible : aucune session (échec fermé).
 */
import { requete } from "@/lib/base";
import { DUREE_PARTIELLE_SEC, verifierJeton, type ContenuJeton } from "@/lib/jeton-session";

/** L'identifiant du téléphone enregistré (confirmé, non archivé), ou null. */
export async function idSecondCodeActif(): Promise<string | null> {
  const [r] = await requete<{ id: string }>("SELECT id::text AS id FROM second_code WHERE confirme_le IS NOT NULL AND archive_le IS NULL");
  return r?.id ?? null;
}

export async function sessionComplete(jeton: string | undefined): Promise<ContenuJeton | null> {
  const contenu = await verifierJeton(jeton);
  if (!contenu?.sc || contenu.etape) return null;
  try {
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
  if (!c || c.sc || c.etape !== "mdp" || c.iat === undefined || c.exp === undefined) return null;
  return c.exp - c.iat <= DUREE_PARTIELLE_SEC ? c : null;
}
