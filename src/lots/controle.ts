/**
 * T10 · Contrôle d'un paquet à coller, sans accès à la base : champs et limites du contrat (§ 3), aucun interdit
 * de la base 8, aucun nombre (la table des faits est vide : aucun chiffre ne peut être sourcé), fin au mot
 * seulement si le mot est branché sur chaque compte des réseaux de la ligne (Instagram et pages Facebook).
 * Un paquet refusé l'est avec sa raison, prise dans la base 8 quand elle y est.
 */
import { paquet as schemaPaquet, type CodePublic, type Paquet, type Reseau } from "@/contrats";
import { motBranchePour } from "@/tirage/fins";
import type { BasesTirage } from "@/tirage/types";

/** Une ligne de la table `interdit` (base 8). */
export interface InterditControle {
  code: string;
  expression: string | null;
  remplacement: string | null;
  raison: string | null;
  portee: string | null;
}

export interface ContexteControle {
  interdits: readonly InterditControle[];
  /** Réseaux de la ligne de lot : la fin au mot vaut pour chacun. */
  reseaux: readonly Reseau[];
  comptes: BasesTirage["comptes"];
  motsBranches: BasesTirage["motsBranches"];
  /** Public de la ligne : les interdits « recrutement » ne valent que hors du public Clients. */
  public?: CodePublic | null;
}

export interface RefusPaquet {
  champ: keyof Paquet | "fin";
  /** `interdit.<slug>` quand la raison vient de la base 8. */
  code: string | null;
  raison: string;
}

export type ResultatControle = { ok: true; paquet: Paquet } | { ok: false; refus: RefusPaquet[] };

export const RESEAUX_DU_MOT: readonly Reseau[] = ["instagram", "facebook"];

const VILLES =
  "grenobl(?:e|ois|oise)s?|paris(?:ien(?:ne)?s?)?|lyon(?:nais(?:e)?s?)?|marseille|toulouse|nantes|strasbourg|montpellier|bordeaux|lille|rennes|reims|toulon|dijon|angers|annecy|chambéry|clermont-ferrand|limoges|metz|nancy|rouen|caen|brest|perpignan|avignon|isère|savoie|bretagne|normandie|occitanie|provence|alsace|lorraine|auvergne|rhône-alpes|île-de-france|hauts-de-france|nouvelle-aquitaine|grand est|bourgogne|franche-comté|centre-val de loire|pays de la loire|corse";

const MARQUES =
  /\b(?:Excel|ChatGPT|Gmail|Outlook|Google|Microsoft|Notion|Zapier|HubSpot|Salesforce|Pennylane|QuickBooks|Doctolib|WhatsApp|Canva|Slack|Copilot|Gemini|OpenAI|Sage|EBP|Dropbox|Trello|Airtable|Shopify)\b/;

/**
 * « garanti », « garantis », « gain garanti », « satisfaction garantie » : une promesse, refusée. « garantie » au sens
 * d'assurance ne l'est pas : « garantie décennale », « garanties du contrat », « garantie responsabilité civile »,
 * « retenue de garantie », « vos garanties ».
 */
const SUITES_ASSURANCE =
  "décennale|biennale|de parfait achèvement|dommages?[- ]ouvrage|responsabilité civile|rc\\b|d['’]assurance|de prévoyance|santé|décès|incapacité|invalidité|perte d['’]exploitation|du contrat|des contrats|de (?:votre|vos|leur|leurs|ce|ces|son|ses|notre|nos) contrats?";
const GARANTI = `\\bgarantis?\\b|(?<!retenues? de |\\b(?:vos|les|des|ses|leurs|nos|aux|mes|tes) )\\bgaranties?\\b(?!\\s+(?:${SUITES_ASSURANCE}))`;

/**
 * Ce que chaque interdit de la base 8 refuse dans un texte. Un interdit absent d'ici (ligne ajoutée aux bases)
 * refuse les expressions qu'il cite entre « ».
 */
const MOTIFS: Record<string, RegExp> = {
  "interdit.ville": new RegExp(`(?<![\\p{L}-])(?:${VILLES})(?![\\p{L}-])`, "iu"),
  "interdit.cpf": /\bCPF\b/i,
  "interdit.gain-garanti": /aucun gain garanti/i,
  "interdit.cas-client": /\b(?:un de )?nos clients\b|\bnotre client\b|\bun de mes clients\b/i,
  "interdit.prix": /€|\beuros?\b|\b(?:HT|TTC)\b/,
  "interdit.likez": /\blik(?:e|ez|er)\b|mettez un j['’]aime/i,
  "interdit.apporteurs": /\bapporteurs?\b(?!\s+d['’]affaires)|\bagents?\s+commerci(?:al|aux)\b/i,
  "interdit.pme-cac40": /\bCAC\s*40\b/i,
  "interdit.top": /\btop\s*\d+\s*%?/i,
  "interdit.promesse-gain": new RegExp(`vous allez gagner|rentabilis[ée]e?s? en|${GARANTI}`, "iu"),
  "interdit.remplacer": /remplacer vos (?:salariés|employés|équipes|collaborateurs)|baisser vos charges de personnel/i,
  "interdit.recrutement-revenu": /\brevenus?\b|\bsalaires?\b|gagner de l['’]argent/i,
  "interdit.recrutement-facile": new RegExp(`\\bfaciles?\\b|${GARANTI}|\\bparrainage\\b`, "iu"),
  "interdit.recrutement-qualiopi": /qualiopi/i,
  "interdit.verification-apporteur": /vérifi\w*\s+(?:l['’]|les\s+|vos\s+)?apporteurs?/i,
  "interdit.marque-logiciel": MARQUES,
  "interdit.accroche-creuse": /savez-vous que|vous perdez du temps/i,
};

/** Interdits qui dépendent du réseau ou de la fin : vérifiés à part. */
const PAR_RESEAU: Record<string, (p: Paquet, ctx: ContexteControle) => RegExp | null> = {
  // L'abonnement n'est une condition que sur Instagram, pour un cadeau envoyé par message privé.
  "interdit.abonnement-condition": (p, ctx) =>
    p.fin.type === "commentaire" && ctx.reseaux.every((r) => r === "instagram") ? null : /abonnez-vous (?:et|pour) (?:recevoir|avoir|écrivez)|réservée? aux abonnés/i,
  "interdit.mot-hors-reseau": (p) => (p.reseau === "fil" ? null : /écrivez\s+.{1,30}\s+en commentaire|\bcommentez\b/i),
  "interdit.promesse-envoi": (p) => (p.reseau === "fil" ? null : /je vous l['’]envoie|je vous envoie/i),
};

const NOMBRES_EN_LETTRES =
  /(?<![\p{L}-])(?:deux|trois|quatre|cinq|six|sept|huit|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille|millions?|milliards?|dizaines?|centaines?|milliers?|z[ée]ro|moiti[ée]s?|quarts?|tiers|doubl\w*|tripl\w*)(?![\p{L}])/iu;

/** Le premier nombre d'un texte (chiffre, pourcentage ou nombre en lettres), ou null. */
export function nombreDans(texte: string): string | null {
  const chiffre = /\d+(?:[.,]\d+)?\s*%?|%/.exec(texte);
  if (chiffre) return chiffre[0].trim();
  const lettres = NOMBRES_EN_LETTRES.exec(texte);
  return lettres ? lettres[0] : null;
}

function citees(expression: string | null): RegExp | null {
  const fragments = [...(expression ?? "").matchAll(/«\s*([^»]+?)\s*»/g)].map((m) => m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return fragments.length ? new RegExp(fragments.join("|"), "i") : null;
}

function horsPortee(i: InterditControle, ctx: ContexteControle): boolean {
  const portee = (i.portee ?? "").toLowerCase();
  return portee.startsWith("recrutement") && (ctx.public ?? "public.clients") === "public.clients";
}

/** Les textes du paquet qui seront dits ou écrits, le repère retiré du sujet. */
function textes(p: Paquet): [RefusPaquet["champ"], string][] {
  const t: [RefusPaquet["champ"], string][] = [
    ["sujet", p.sujet.replace(/\s*\[usine:[^\]]*\]$/, "")],
    ["public", p.public],
    ["envoi", p.envoi],
  ];
  if (p.vraiCas) t.push(["vraiCas", Object.values(p.vraiCas).join(" ")]);
  if (p.fin.type === "commentaire") t.push(["fin", p.fin.mot]);
  return t;
}

function raisonDe(i: InterditControle, trouve: string): string {
  const remplacement = i.remplacement?.trim() ? ` À la place : ${i.remplacement.trim()}` : "";
  return `« ${trouve} » : ${i.raison?.trim() || "interdit de la base 8."}${remplacement}`;
}

const NOMS_RESEAU: Partial<Record<Reseau, string>> = { instagram: "Instagram", facebook: "Facebook" };

/** Contrôle un paquet. Rend le paquet validé, ou toutes les raisons du refus. */
export function controler(brut: unknown, ctx: ContexteControle): ResultatControle {
  const lu = schemaPaquet.safeParse(brut);
  if (!lu.success) {
    return {
      ok: false,
      refus: lu.error.issues.map((e) => ({
        champ: (e.path[0] as RefusPaquet["champ"]) ?? "sujet",
        code: null,
        raison: e.code === "too_big" ? `Le champ « ${String(e.path.join("."))} » dépasse ${String((e as { maximum?: number }).maximum)} signes.` : e.message,
      })),
    };
  }
  const p = lu.data;
  const refus: RefusPaquet[] = [];
  const interdits = ctx.interdits.filter((i) => !horsPortee(i, ctx));
  const chiffre = interdits.find((i) => i.code === "interdit.chiffre") ?? {
    code: "interdit.chiffre",
    expression: null,
    remplacement: "Dire ce qui change, sans chiffre",
    raison: "Aucun chiffre inventé.",
    portee: "partout",
  };

  for (const [champ, texte] of textes(p)) {
    const n = nombreDans(texte);
    if (n) refus.push({ champ, code: chiffre.code, raison: `${raisonDe(chiffre, n)} (la table des faits est vide : aucun nombre n'est sourcé).` });
    for (const i of interdits) {
      if (i.code === "interdit.chiffre") continue;
      const motif = i.code in PAR_RESEAU ? PAR_RESEAU[i.code](p, ctx) : (MOTIFS[i.code] ?? citees(i.expression));
      const trouve = motif?.exec(texte);
      if (trouve) refus.push({ champ, code: i.code, raison: raisonDe(i, trouve[0]) });
    }
  }

  if (p.fin.type === "commentaire") {
    const mot = p.fin.mot.toUpperCase();
    if (p.reseau !== "fil" || ctx.reseaux.some((r) => !RESEAUX_DU_MOT.includes(r))) {
      refus.push({ champ: "fin", code: "interdit.mot-hors-reseau", raison: "La fin au mot n'est permise que sur Instagram et les pages Facebook." });
    }
    for (const r of ctx.reseaux.filter((x) => RESEAUX_DU_MOT.includes(x))) {
      if (motBranchePour(r, ctx.comptes, ctx.motsBranches)?.toUpperCase() !== mot) {
        refus.push({ champ: "fin", code: null, raison: `Le mot ${mot} n'est pas branché sur ${NOMS_RESEAU[r] ?? r} : choisissez la fin « Un appel de diagnostic ».` });
      }
    }
  }

  // LinkedIn : aucun appel dit dans la vidéo ; le studio n'offre que le mot ou le diagnostic (D9).
  if (ctx.reseaux.includes("linkedin")) {
    refus.push({ champ: "fin", code: null, raison: "LinkedIn : aucun appel dit dans la vidéo, et le studio n'a pas encore de fin sans appel. Commandez ce contenu sans LinkedIn." });
  }

  return refus.length ? { ok: false, refus } : { ok: true, paquet: p };
}
