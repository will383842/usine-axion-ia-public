/**
 * T10 · Le paquet à coller dans `/tableau/nouvelle` du studio (CONTRATS-ECHANGE.md § 3), écrit à partir de la fiche
 * (cas, douleur, accroche du cas), sans appel à un modèle et sans aucun appel au studio : Will copie champ par champ.
 * - `paquet()` : la ligne de lot et sa fiche → les champs du studio, coupés à leurs limites ;
 * - `paquetsDuLot()` : chaque ligne commandée, son paquet et son contrôle (`controle.ts`).
 * Le repère `usine:L12-3` finit le sujet, jamais un lien.
 */
import "server-only";
import { FORME_MOT_STUDIO, SERIE_STUDIO, repereDe, type CodeService, type Paquet, type Reseau, type SerieStudio } from "@/contrats";
import { depots, interrupteurAllume, type LotLigne } from "@/donnees";
import { requete } from "@/lib/base";
import { INTERRUPTEUR_MOTS } from "@/mots/mot-branche";
import { estFinAuMot, motBranchePour, type Appel } from "@/tirage/fins";
import type { BasesTirage } from "@/tirage/types";
import { controler, RESEAUX_DU_MOT, type ContexteControle, type ResultatControle } from "./controle";

export const INTERRUPTEUR_PAQUET = "lots.paquet";
/** L'écran du studio où Will colle le paquet (lien ouvert dans le navigateur ; l'Usine n'y envoie rien). */
export const ADRESSE_STUDIO = "https://studio.axion-ia.com/tableau/nouvelle";

export const LIMITES = { sujet: 160, public: 200, envoi: 300 } as const;
const ENVOI_DIAGNOSTIC = "Le diagnostic en ligne, en quelques minutes.";

/** Ce que la fiche apporte au paquet (bases 1, 2, 3, 4, 7 et le registre des mots). */
export interface FichePaquet {
  metier: { nom: string | null } | null;
  taille: { nom: string | null } | null;
  douleur: { dite: string | null } | null;
  cas: { titre: string | null; accroche: string | null } | null;
  sujet: { titre: string | null; serie_studio: string | null } | null;
  actualite: { titre: string | null } | null;
  /** Les fins de la ligne qui sont au mot (`appel.code`). */
  finsAuMot: readonly string[];
  /** Le mot de la fin au mot (le mot branché, sinon le premier du registre) et le nom de son cadeau. */
  mot: { mot: string; cadeau: string | null } | null;
}

export type LignePaquet = Pick<LotLigne, "id" | "service" | "reseaux" | "fins">;

/** Une ligne, sans retour, coupée au dernier mot entier sous `max` signes (« … » compris). */
export function couper(texte: string, max: number): string {
  const net = texte.replace(/\s+/g, " ").trim();
  if (net.length <= max) return net;
  const coupe = net.slice(0, max - 1);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > max / 2 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:.—-]+$/, "")}…`;
}

/** Le réseau du studio : LinkedIn seul, YouTube seul, Instagram et Facebook seuls (le fil), sinon les formats courts. */
export function reseauDuPaquet(reseaux: readonly Reseau[]): Paquet["reseau"] {
  if (reseaux.length && reseaux.every((r) => r === "linkedin")) return "linkedin";
  if (reseaux.length && reseaux.every((r) => r === "youtube")) return "youtube";
  if (reseaux.length && reseaux.every((r) => RESEAUX_DU_MOT.includes(r))) return "fil";
  return "courts";
}

function serie(l: LignePaquet, f: FichePaquet): SerieStudio {
  if (l.service && l.service in SERIE_STUDIO) return SERIE_STUDIO[l.service as CodeService];
  const duSujet = f.sujet?.serie_studio?.trim();
  return duSujet && (Object.values(SERIE_STUDIO) as string[]).includes(duSujet) ? (duSujet as SerieStudio) : "formation";
}

/** Le paquet d'une ligne de lot, aux champs et limites du studio. À contrôler par `controler()` avant de le montrer. */
export function paquet(l: LignePaquet, f: FichePaquet): Paquet {
  const repere = ` [${repereDe(l.id)}]`;
  const titre = f.cas?.titre ?? f.actualite?.titre ?? f.sujet?.titre ?? f.douleur?.dite ?? "Sujet à préciser";
  const accroche = f.cas?.accroche?.replace(/\s+/g, " ").trim();
  const place = LIMITES.sujet - repere.length;
  const avecAccroche = accroche ? `${titre.trim()} — ${accroche}` : titre;
  const sujet = `${couper(avecAccroche.length <= place ? avecAccroche : titre, place)}${repere}`;

  const nom = f.metier?.nom?.replace(/\s*\(cas général\)/i, "").trim();
  const sansPrefixe = nom && /^directeur|dirigeant/i.test(nom);
  const qui = [nom ? (sansPrefixe ? nom : `Dirigeant · ${nom}`) : "Dirigeant d'entreprise", f.taille?.nom].filter(Boolean).join(" · ");
  const douleur = f.douleur?.dite?.replace(/\s+/g, " ").trim();
  const avecDouleur = douleur ? `${qui}. Ce qui lui pèse : ${douleur}` : qui;
  const publicVise = couper(avecDouleur.length <= LIMITES.public ? avecDouleur : qui, LIMITES.public);

  const reseau = reseauDuPaquet(l.reseaux);
  const toutesAuMot = l.reseaux.length > 0 && l.reseaux.every((r) => l.fins[r] && f.finsAuMot.includes(l.fins[r]!));
  const auMot = reseau === "fil" && toutesAuMot && f.mot !== null && FORME_MOT_STUDIO.test(f.mot.mot);
  const envoi = auMot
    ? `${f.mot!.cadeau ?? "Le cadeau"}, envoyé en message privé à qui écrit ${f.mot!.mot} en commentaire.`
    : ENVOI_DIAGNOSTIC;

  return {
    serie: serie(l, f),
    sujet,
    public: publicVise,
    // Aucun vrai cas : un cas n'est « chez nous » que si Will le dit.
    vraiCas: null,
    reseau,
    fin: auMot ? { type: "commentaire", mot: f.mot!.mot } : { type: "diagnostic" },
    envoi: couper(envoi, LIMITES.envoi),
  };
}

export interface PaquetDeLigne {
  ligne: LotLigne;
  paquet: Paquet;
  controle: ResultatControle;
}

function douleursDuCas(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return typeof v === "string" ? v.split(/[,;|\s]+/).filter(Boolean) : [];
}

export async function paquetAllume(): Promise<boolean> {
  return interrupteurAllume(INTERRUPTEUR_PAQUET);
}

/** Le paquet et le contrôle de chaque ligne commandée (lu à l'affichage : le mot branché est celui du moment). */
export async function paquetsDuLot(lignes: readonly LotLigne[]): Promise<PaquetDeLigne[]> {
  if (!lignes.length) return [];
  const codes = (cle: "metier" | "douleur" | "cas_usage" | "sujet" | "actualite") => [...new Set(lignes.map((l) => l[cle]).filter((c): c is string => Boolean(c)))];
  const appelsCodes = [...new Set(lignes.flatMap((l) => Object.values(l.fins)).filter((c): c is string => Boolean(c)))];
  const [metiers, tailles, douleurs, cas, sujets, actus, appels, interdits, comptes, mots] = await Promise.all([
    requete<{ code: string; nom: string | null }>("SELECT code, nom FROM metier WHERE code = ANY($1)", [codes("metier")]),
    requete<{ code: string; nom: string | null }>("SELECT code, nom FROM taille"),
    requete<{ code: string; dite: string | null }>("SELECT code, dite FROM douleur WHERE code = ANY($1)", [codes("douleur")]),
    requete<{ code: string; titre: string | null; accroche: string | null; douleurs: unknown }>("SELECT code, titre, accroche, douleurs FROM cas_usage WHERE code = ANY($1)", [codes("cas_usage")]),
    requete<{ code: string; titre: string | null; serie_studio: string | null }>("SELECT code, titre, serie_studio FROM sujet WHERE code = ANY($1)", [codes("sujet")]),
    requete<{ code: string; titre: string | null }>("SELECT code, titre FROM actualite WHERE code = ANY($1)", [codes("actualite")]),
    requete<Appel>("SELECT * FROM appel WHERE code = ANY($1)", [appelsCodes]),
    requete<ContexteControle["interdits"][number]>("SELECT code, expression, remplacement, raison, portee FROM interdit WHERE etat <> 'retire' ORDER BY code"),
    depots.compte.lister({ ou: { actif: true } }),
    requete<{ mot: string; cadeau: string | null }>("SELECT m.mot, c.nom AS cadeau FROM mot m LEFT JOIN cadeau c ON c.code = m.cadeau WHERE m.archive_le IS NULL ORDER BY m.ordre, m.code"),
  ]);
  const motsBranches: BasesTirage["motsBranches"] = (await interrupteurAllume(INTERRUPTEUR_MOTS))
    ? (await depots.mot_branche.lister({ ou: { etat: "branche" } })).map((m) => ({ mot: m.mot, reseau: m.reseau as Reseau, compte: m.compte }))
    : [];
  const duCompte: BasesTirage["comptes"] = comptes.filter((c) => c.etat !== "retire").map((c) => ({ code: c.code, reseau: c.reseau, lien_profil: c.lien_profil }));
  const finsAuMot = appels.filter(estFinAuMot).map((a) => a.code);
  const par = <T extends { code: string }>(xs: T[]) => new Map(xs.map((x) => [x.code, x]));
  const [m, t, d, c, s, a] = [par(metiers), par(tailles), par(douleurs), par(cas), par(sujets), par(actus)];

  return lignes.map((ligne) => {
    const reseauxMot = ligne.reseaux.filter((r) => RESEAUX_DU_MOT.includes(r));
    const branche = reseauxMot.map((r) => motBranchePour(r, duCompte, motsBranches)).find(Boolean);
    const leMot = (branche ? mots.find((x) => x.mot.toUpperCase() === branche.toUpperCase()) : undefined) ?? mots[0];
    const fiche: FichePaquet = {
      metier: (ligne.metier && m.get(ligne.metier)) || null,
      taille: (ligne.taille && t.get(ligne.taille)) || null,
      // La douleur n'est dite que si le cas la cite (sinon c'est un tirage au hasard du métier).
      douleur: (ligne.douleur && douleursDuCas(c.get(ligne.cas_usage ?? "")?.douleurs).includes(ligne.douleur) && d.get(ligne.douleur)) || null,
      cas: (ligne.cas_usage && c.get(ligne.cas_usage)) || null,
      sujet: (ligne.sujet && s.get(ligne.sujet)) || null,
      actualite: (ligne.actualite && a.get(ligne.actualite)) || null,
      finsAuMot,
      mot: leMot ? { mot: branche ?? leMot.mot, cadeau: leMot.cadeau } : null,
    };
    const p = paquet(ligne, fiche);
    return { ligne, paquet: p, controle: controler(p, { interdits, reseaux: ligne.reseaux, comptes: duCompte, motsBranches, public: ligne.public as ContexteControle["public"] }) };
  });
}

/** Les champs du paquet dans l'ordre de l'écran du studio, avec leur libellé et le texte à copier. */
export function champsAColler(p: Paquet): { cle: string; libelle: string; texte: string }[] {
  const vraiCas = p.vraiCas ? Object.entries(p.vraiCas).map(([k, v]) => `${k} : ${v}`).join("\n") : "";
  return [
    { cle: "serie", libelle: "Série", texte: p.serie },
    { cle: "sujet", libelle: "Sujet", texte: p.sujet },
    { cle: "public", libelle: "Public", texte: p.public },
    { cle: "vraiCas", libelle: "Vrai cas", texte: vraiCas },
    { cle: "reseau", libelle: "Réseau", texte: p.reseau },
    { cle: "fin", libelle: "Fin", texte: p.fin.type === "commentaire" ? `Un mot à commenter : ${p.fin.mot}` : "Un appel de diagnostic" },
    { cle: "envoi", libelle: "Ce qui sera envoyé", texte: p.envoi },
  ];
}
