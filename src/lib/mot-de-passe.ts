/**
 * Mot de passe de Will : jamais dans le dépôt, jamais en clair. Le hachage argon2id (encodé en base64) se lit :
 * d'abord dans `USINE_PASSWORD_HASH_B64` si elle est réglée (fabriquée par `scripts/hacher-mot-de-passe.mjs`) ;
 * sinon dans le réglage `connexion.hachage`, écrit à la première ouverture par Will lui-même.
 */
import { hash, verify } from "@node-rs/argon2";
import { baseConfiguree, requete } from "./base";
import { cleAdresse, dansPlagesCloudflare } from "./plages-cloudflare";

export const REGLAGES_ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hachageDepuisB64(b64: string | undefined): string | null {
  if (!b64) return null;
  const h = Buffer.from(b64, "base64").toString("utf8");
  return h.startsWith("$argon2id$") ? h : null;
}

/** Vrai seulement si le mot de passe correspond au hachage. Même coût de calcul sans hachage ou sans saisie. */
export async function verifierMotDePasse(motDePasse: string, hashB64: string | undefined): Promise<boolean> {
  const h = hachageDepuisB64(hashB64);
  if (!h || !motDePasse) {
    await hash("temps-constant", REGLAGES_ARGON2).catch(() => undefined);
    return false;
  }
  try {
    return await verify(h, motDePasse);
  } catch {
    return false;
  }
}

export const CLE_HACHAGE = "connexion.hachage";
export const LONGUEUR_MIN = 12;

export interface HachageEnVigueur {
  hashB64: string;
  source: "variable" | "reglage";
}

/** Le hachage en vigueur, ou null s'il n'y en a aucun. Base illisible : erreur (jamais « aucun hachage »). */
export async function hachageEnVigueur(): Promise<HachageEnVigueur | null> {
  const variable = process.env.USINE_PASSWORD_HASH_B64;
  if (variable) return { hashB64: variable, source: "variable" };
  if (!baseConfiguree()) return null;
  const [r] = await requete<{ valeur: unknown }>("SELECT valeur FROM reglage WHERE cle = $1", [CLE_HACHAGE]);
  return typeof r?.valeur === "string" ? { hashB64: r.valeur, source: "reglage" } : null;
}

/** La première ouverture n'existe que sans aucun hachage ET avec `USINE_PREMIERE_OUVERTURE=oui`. */
export async function premiereOuverturePossible(): Promise<boolean> {
  return process.env.USINE_PREMIERE_OUVERTURE === "oui" && !(await hachageEnVigueur());
}

export type Resultat = { ok: true } | { ok: false; message: string };

/** Message de refus d'un nouveau mot de passe, ou null s'il convient. */
export function refusNouveau(motDePasse: string, confirmation: string): string | null {
  if ([...motDePasse].length < LONGUEUR_MIN) return `Choisissez ${LONGUEUR_MIN} caractères au moins.`;
  if (motDePasse !== confirmation) return "Les deux saisies diffèrent.";
  return null;
}

async function hacherB64(motDePasse: string): Promise<string> {
  return Buffer.from(await hash(motDePasse, REGLAGES_ARGON2)).toString("base64");
}

/** Première ouverture : écrit le hachage s'il n'en existe aucun. Deux enregistrements simultanés : le premier gagne. */
export async function enregistrerPremierHachage(motDePasse: string, confirmation: string): Promise<Resultat> {
  if (!(await premiereOuverturePossible())) return { ok: false, message: "L'Usine n'est pas encore ouverte." };
  const refus = refusNouveau(motDePasse, confirmation);
  if (refus) return { ok: false, message: refus };
  const lignes = await requete("INSERT INTO reglage (cle, valeur) VALUES ($1, $2::jsonb) ON CONFLICT (cle) DO NOTHING RETURNING cle", [
    CLE_HACHAGE,
    JSON.stringify(await hacherB64(motDePasse)),
  ]);
  return lignes.length ? { ok: true } : { ok: false, message: "Le mot de passe est déjà choisi." };
}

/** Change le hachage du réglage si l'ancien mot de passe est le bon. Un hachage venu de la variable ne se change pas ici. */
export async function changerHachage(ancien: string, nouveau: string, confirmation: string): Promise<Resultat> {
  const actuel = await hachageEnVigueur();
  if (actuel?.source === "variable") return { ok: false, message: MESSAGE_VARIABLE };
  const correct = await verifierMotDePasse(ancien, actuel?.hashB64);
  if (!actuel || !correct) return { ok: false, message: "Mot de passe actuel incorrect." };
  const refus = refusNouveau(nouveau, confirmation);
  if (refus) return { ok: false, message: refus };
  // Seulement si le hachage n'a pas changé entre-temps : deux changements simultanés, le premier gagne.
  const lignes = await requete("UPDATE reglage SET valeur = $2::jsonb, modifie_le = now() WHERE cle = $1 AND valeur = $3::jsonb RETURNING cle", [
    CLE_HACHAGE,
    JSON.stringify(await hacherB64(nouveau)),
    JSON.stringify(actuel.hashB64),
  ]);
  return lignes.length ? { ok: true } : { ok: false, message: "Le mot de passe vient d'être changé ailleurs. Reconnectez-vous." };
}

export const MESSAGE_VARIABLE = "Votre mot de passe est réglé sur le serveur : il se change là-bas, dans la variable USINE_PASSWORD_HASH_B64.";

/**
 * Limite d'essais, gardée en mémoire du serveur : 5 échecs en 15 minutes par adresse (une IPv6 compte par son /64),
 * et 30 échecs en 15 minutes toutes adresses confondues (un attaquant qui change d'adresse est ralenti). Un appareil
 * où Will s'est déjà connecté (témoin `usine_appareil`) est compté par son identifiant, 5 échecs en 15 minutes, et
 * jamais par son adresse ni par la limite globale : un tiers, même s'il forge l'adresse de Will, ne le tient pas
 * dehors ; un témoin volé ne gagne rien à changer d'adresse. Fenêtre glissante : chaque échec sort du compte au bout
 * de 15 minutes. Les échecs de plus de 15 minutes sont retirés à chaque passage : la table ne grossit pas.
 */
export const FENETRE_MS = 15 * 60 * 1000;
export const ECHECS_MAX = 5;
export const ECHECS_MAX_TOUTES_ADRESSES = 30;

function cleDe(ip: string, appareil: string | null): string {
  return appareil ? `appareil:${appareil}` : cleAdresse(ip);
}

export class LimiteEssais {
  private echecs = new Map<string, number[]>();
  private tous: number[] = [];

  /** `appareil` : l'identifiant du témoin `usine_appareil` s'il est valide. */
  bloque(ip: string, maintenant = Date.now(), appareil: string | null = null): boolean {
    this.purger(maintenant);
    const propres = (this.echecs.get(cleDe(ip, appareil))?.length ?? 0) >= ECHECS_MAX;
    return propres || (!appareil && this.tous.length >= ECHECS_MAX_TOUTES_ADRESSES);
  }

  noterEchec(ip: string, maintenant = Date.now(), appareil: string | null = null): void {
    this.purger(maintenant);
    const cle = cleDe(ip, appareil);
    this.echecs.set(cle, [...(this.echecs.get(cle) ?? []), maintenant]);
    this.tous.push(maintenant);
  }

  /** Si rien ne bloque, compte l'essai tout de suite comme un échec (un essai simultané le voit) et rend vrai. */
  reserver(ip: string, maintenant = Date.now(), appareil: string | null = null): boolean {
    if (this.bloque(ip, maintenant, appareil)) return false;
    this.noterEchec(ip, maintenant, appareil);
    return true;
  }

  /** Rend une place réservée à `quand` : l'essai a réussi ou n'a pas eu lieu (panne de base). */
  rendre(ip: string, quand: number, appareil: string | null = null): void {
    const cle = cleDe(ip, appareil);
    const liste = this.echecs.get(cle) ?? [];
    const i = liste.indexOf(quand);
    if (i >= 0) liste.splice(i, 1);
    if (!liste.length) this.echecs.delete(cle);
    const j = this.tous.indexOf(quand);
    if (j >= 0) this.tous.splice(j, 1);
  }

  oublier(ip: string, appareil: string | null = null): void {
    this.echecs.delete(cleDe(ip, appareil));
  }

  private purger(maintenant: number): void {
    const recent = (t: number) => maintenant - t < FENETRE_MS;
    for (const [ip, liste] of this.echecs) {
      const restent = liste.filter(recent);
      if (restent.length) this.echecs.set(ip, restent);
      else this.echecs.delete(ip);
    }
    this.tous = this.tous.filter(recent);
  }
}

/** Ce qu'il faut des en-têtes d'une requête. */
export interface EntetesRequete {
  get(nom: string): string | null;
}

/**
 * L'adresse de la personne. La dernière valeur de `x-forwarded-for` est ajoutée par Traefik : c'est l'adresse qui
 * s'est réellement connectée. Le serveur répond aussi en direct : `cf-connecting-ip` et l'avant-dernière valeur de
 * `x-forwarded-for` ne sont crus QUE si cette dernière valeur appartient aux plages de Cloudflare
 * (`plages-cloudflare.ts`) ; sinon, c'est elle qui est retenue. Sans `x-forwarded-for` : `x-real-ip`, sinon « local ».
 */
export function adresseDepuisEntetes(h: EntetesRequete): string {
  const xff = h.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
  const derniere = xff.at(-1);
  if (!derniere) return h.get("x-real-ip")?.trim() || "local";
  if (!dansPlagesCloudflare(derniere)) return derniere;
  return h.get("cf-connecting-ip")?.trim() || xff.at(-2) || derniere;
}
