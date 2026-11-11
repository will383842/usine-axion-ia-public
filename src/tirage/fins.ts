/**
 * Fin par réseau, prise dans la base 7 (`appel`) selon PLAN-MAITRE A.3 point 3 :
 * - fin au mot seulement si le mot est branché sur le(s) compte(s) du réseau, 1 contenu sur 3 au plus sur 7 jours ;
 * - LinkedIn : aucun appel dit dans la vidéo (seules les fins sans phrase dite ni écrite à l'écran) ;
 * - TikTok et Shorts : jamais de promesse d'envoi ;
 * - « enregistrez » et « partagez » : 1 contenu sur 3 au plus (ensemble) ; jamais « dans la bio » ;
 * - une fin qui renvoie au profil seulement si le lien du profil de chaque compte du réseau mène à la bonne page ;
 * - la fin « rendez-vous » seulement si son interrupteur est allumé.
 */
import { lireListe, PAGES_ARRIVEE, type Reseau, type TypeContenu } from "@/contrats";
import type { BasesTirage } from "./types";

export type Appel = BasesTirage["appels"][number];

export const FENETRE_FINS_JOURS = 7;

/** Compte des fins d'un réseau sur 7 jours (historique et lignes déjà tirées). */
export interface CompteFins {
  total: number;
  mot: number;
  enregistrerOuPartager: number;
}

export interface ContexteFin {
  reseau: Reseau;
  typeContenu: TypeContenu;
  comptes: BasesTirage["comptes"];
  motsBranches: BasesTirage["motsBranches"];
  finRendezVous: boolean;
  compte: CompteFins;
}

/** `linkedin_page` des bases = réseau `linkedin` (contrat § 2). */
export function reseauxDeLAppel(a: Pick<Appel, "reseaux">): Reseau[] {
  return lireListe(a.reseaux).map((r) => (r === "linkedin_page" || r === "linkedin-page" ? "linkedin" : r)) as Reseau[];
}

/** `post_texte` des bases = type de contenu `texte` ; vide = tous. */
export function typesDeContenu(valeur: string | null): string[] {
  return lireListe(valeur).map((t) => (t === "post_texte" ? "texte" : t));
}

export function estFinAuMot(a: Appel): boolean {
  return a.objectif === "MOT_CADEAU" || Boolean(a.mot?.trim());
}

function estEnregistrerOuPartager(a: Appel): boolean {
  return a.objectif === "ENREGISTRER" || a.objectif === "PARTAGER";
}

function estRendezVous(a: Appel): boolean {
  return a.objectif === "RENDEZ_VOUS" || a.type === "rendez-vous";
}

function textes(a: Appel): string {
  return [a.dit, a.ecran, a.legende].filter(Boolean).join(" ");
}

export function renvoieAuProfil(a: Appel): boolean {
  return /profil/i.test(`${a.emplacement ?? ""} ${a.dit ?? ""} ${a.ecran ?? ""}`);
}

/** La page où doit mener le lien du profil pour cette fin : `/fr/appel` pour un rendez-vous, sinon le guide. */
export function pageDuProfil(a: Appel): string {
  return estRendezVous(a) ? PAGES_ARRIVEE.appel : PAGES_ARRIVEE.guide;
}

/** Une fois de plus sur 7 jours reste-t-elle à 1 sur 3 au plus ? */
export function tientUnSurTrois(deja: number, total: number): boolean {
  return (deja + 1) * 3 <= total + 1;
}

/** Le mot branché sur tous les comptes du réseau (une ligne sans compte vaut pour tout le réseau), ou null. */
export function motBranchePour(reseau: Reseau, comptes: BasesTirage["comptes"], motsBranches: BasesTirage["motsBranches"]): string | null {
  const duReseau = comptes.filter((c) => c.reseau === reseau);
  if (!duReseau.length) return null;
  const candidats = [...new Set(motsBranches.filter((m) => m.reseau === reseau).map((m) => m.mot))];
  for (const mot of candidats) {
    const lignes = motsBranches.filter((m) => m.reseau === reseau && m.mot === mot);
    const identifiant = (code: string) => code.slice(code.indexOf(":") + 1);
    if (lignes.some((m) => !m.compte) || duReseau.every((c) => lignes.some((m) => m.compte === identifiant(c.code) || m.compte === c.code))) return mot;
  }
  return null;
}

/** Les fins permises pour ce réseau, ce type de contenu et ces comptes, avant les règles de proportion. */
export function finsPermises(appels: readonly Appel[], ctx: Omit<ContexteFin, "compte">): Appel[] {
  const duReseau = ctx.comptes.filter((c) => c.reseau === ctx.reseau);
  const mot = motBranchePour(ctx.reseau, ctx.comptes, ctx.motsBranches);
  return appels.filter((a) => {
    if (a.cible !== "clients" && a.cible !== "public.clients") return false;
    if (!reseauxDeLAppel(a).includes(ctx.reseau)) return false;
    const types = typesDeContenu(a.type_contenu);
    if (types.length && !types.includes(ctx.typeContenu)) return false;
    if (/\bbio\b/i.test(textes(a))) return false;
    if (estRendezVous(a) && !ctx.finRendezVous) return false;
    if (ctx.reseau === "linkedin" && (a.dit?.trim() || a.ecran?.trim())) return false;
    if (ctx.reseau === "tiktok" || ctx.reseau === "youtube-shorts") {
      if (estFinAuMot(a) || a.type === "commentaire" || a.type === "cadeau" || /vous (l['’])?envoie/i.test(textes(a))) return false;
    }
    if (estFinAuMot(a) && !mot) return false;
    if (renvoieAuProfil(a)) {
      const page = pageDuProfil(a);
      if (!duReseau.length || !duReseau.every((c) => (c.lien_profil ?? "").includes(page))) return false;
    }
    return true;
  });
}

/**
 * Choisit la fin d'un réseau : la fin au mot quand elle est permise et tient à 1 sur 3 (elle amène des demandes),
 * sinon une fin de visibilité. `hasard` rend un nombre dans [0, 1[. Null : aucune fin possible sur ce réseau.
 */
export function choisirFin(appels: readonly Appel[], ctx: ContexteFin, hasard: () => number): { appel: string; mot: string | null } | null {
  const permises = finsPermises(appels, ctx);
  const auMot = permises.filter(estFinAuMot);
  if (auMot.length && tientUnSurTrois(ctx.compte.mot, ctx.compte.total)) {
    return { appel: auMot[Math.floor(hasard() * auMot.length)].code, mot: motBranchePour(ctx.reseau, ctx.comptes, ctx.motsBranches) };
  }
  const visibilite = permises.filter((a) => !estFinAuMot(a) && (!estEnregistrerOuPartager(a) || tientUnSurTrois(ctx.compte.enregistrerOuPartager, ctx.compte.total)));
  if (!visibilite.length) return null;
  return { appel: visibilite[Math.floor(hasard() * visibilite.length)].code, mot: null };
}

/** Ajoute une fin au compte de son réseau. */
export function compterFin(compte: CompteFins, a: Appel | undefined): void {
  compte.total += 1;
  if (a && estFinAuMot(a)) compte.mot += 1;
  if (a && estEnregistrerOuPartager(a)) compte.enregistrerOuPartager += 1;
}
