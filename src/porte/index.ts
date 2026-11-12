/**
 * Porte du studio : l'Usine propose des sujets au studio et note ceux qu'il a retenus (docs/CONTRAT-PORTE.md).
 * - `proposerSujets()` : tire comme un lot (bases, réglages, historique de src/tirage/charger.ts), restreint au type
 *   de contenu, aux réseaux et aux filtres demandés ; des métiers demandés sont tirés même non allumés. N'écrit rien.
 * - `retenirSujet()` : note le sujet « déjà fabriqué » (table `deja_fabrique`), pour qu'il ne revienne jamais ; idempotent.
 * - `retenirLot()` : plusieurs sujets d'un coup (20 au plus), contrôlés avant toute écriture, même effet que `retenirSujet`.
 * - `listerMetiers()` : le filtre des métiers du studio.
 * La porte ne lit pas les interrupteurs `tirage` ni `lots` : son interrupteur est le secret (src/porte/acces.ts).
 */
import "server-only";
import {
  codeVersion,
  type DemandeSujets,
  type FinSujet,
  type MetierPorte,
  type ReponseRetenir,
  type ReponseRetenirLot,
  type ReponseSujets,
  type RetenirLot,
  type RetenirSujet,
  type SujetPropose,
} from "@/contrats";
import { journaliser } from "@/donnees";
import { requete } from "@/lib/base";
import { dejaFabriqueParSujet } from "@/lots";
import { finsPermises, signature, tirer, type BasesTirage, type ReglagesTirage } from "@/tirage";
import { chargerBases, chargerHistorique, chargerReglages } from "@/tirage/charger";
import { ErreurPorte } from "./http";

export { ErreurPorte } from "./http";

export const AUCUN_METIER_ALLUME = "Aucun métier allumé : choisissez un métier.";

async function verifierMetiers(d: DemandeSujets): Promise<void> {
  if (d.metiers) {
    const connus = await requete<{ code: string }>("SELECT code FROM metier WHERE code = ANY($1) AND etat <> 'retire'", [d.metiers]);
    const inconnus = d.metiers.filter((m) => !connus.some((c) => c.code === m));
    if (inconnus.length) throw new ErreurPorte(400, "metier_inconnu", `Métier(s) inconnu(s) ou retiré(s) : ${inconnus.join(", ")}.`);
    return;
  }
  const [{ n }] = await requete<{ n: number }>("SELECT count(*)::int AS n FROM metier WHERE allume AND etat <> 'retire'");
  if (!n) throw new ErreurPorte(409, "aucun_metier_allume", AUCUN_METIER_ALLUME);
}

/** Les réglages du tirage pour cette demande : parts égales entre les formats en service du type demandé. */
async function reglagesDeLaDemande(d: DemandeSujets, bases: BasesTirage): Promise<ReglagesTirage> {
  const formats = bases.formats.filter((f) => f.en_service && f.type_contenu === d.type_contenu);
  const parts = Object.fromEntries(formats.map((f) => [f.code, 100 / formats.length]));
  const tailles = d.tailles;
  const services = d.services;
  const repetitionsPermises: ReglagesTirage["repetitionsPermises"] = [];
  if (bases.metiers.length === 1) repetitionsPermises.push("metier");
  if (tailles?.length === 1) repetitionsPermises.push("taille");
  const base = await chargerReglages(bases, {
    reseaux: d.reseaux,
    partsFormats: Object.fromEntries(d.reseaux.map((r) => [r, parts])),
    metiers: d.metiers,
    repetitionsPermises,
    graine: d.graine ?? Math.floor(Math.random() * 2 ** 31),
  });
  return {
    ...base,
    poidsTailles: tailles ? Object.fromEntries(bases.tailles.map((t) => [t.code, tailles.includes(t.code as never) ? (base.poidsTailles[t.code] ?? 1) || 1 : 0])) : base.poidsTailles,
    poidsServices: services ? Object.fromEntries(bases.services.map((s) => [s, services.includes(s as never) ? 1 : 0])) : base.poidsServices,
  };
}

/** Rend n sujets neufs pour le studio. Rien n'est écrit en base. */
export async function proposerSujets(d: DemandeSujets): Promise<ReponseSujets> {
  await verifierMetiers(d);
  const bases = await chargerBases(d.metiers);
  if (!bases.formats.some((f) => f.en_service && f.type_contenu === d.type_contenu)) {
    return { demandees: d.n, lignes: [], pourquoi: [{ metier: null, message: `Aucun format « ${d.type_contenu} » en service dans les bases.` }] };
  }
  const reglages = await reglagesDeLaDemande(d, bases);
  const ctxFin = { typeContenu: d.type_contenu, comptes: bases.comptes, motsBranches: bases.motsBranches, finRendezVous: reglages.finRendezVous };
  const sansFin = d.reseaux.filter((r) => !finsPermises(bases.appels, { ...ctxFin, reseau: r }).length);
  const historique = await chargerHistorique();
  historique.dejaFabrique.push(...(await dejaFabriqueParSujet(bases.cas)));
  const r = tirer(d.n, reglages, historique, bases);
  const pourquoi = [...r.pourquoi];
  if (sansFin.length) pourquoi.unshift({ metier: null, message: `Aucune fin possible pour « ${d.type_contenu} » sur : ${sansFin.join(", ")} (base 7).` });
  return { demandees: r.demandees, lignes: await lisibles(r.lignes, bases), pourquoi };
}

const unique = (v: (string | null)[]) => [...new Set(v.filter((x): x is string => Boolean(x)))];

async function parCode<T extends { code: string }>(sql: string, codes: string[]): Promise<Map<string, T>> {
  if (!codes.length) return new Map();
  return new Map((await requete<T>(sql, [codes])).map((l) => [l.code, l]));
}

/** Les textes des bases pour chaque ligne tirée. */
async function lisibles(lignes: ReturnType<typeof tirer>["lignes"], bases: BasesTirage): Promise<SujetPropose[]> {
  const [metiers, tailles, services, douleurs, cas, actualites, formats, accroches] = await Promise.all([
    parCode<{ code: string; nom: string | null; secteur: string | null }>(
      "SELECT m.code, m.nom, coalesce(s.nom, m.secteur) AS secteur FROM metier m LEFT JOIN secteur s ON s.code = m.secteur WHERE m.code = ANY($1)",
      unique(lignes.map((l) => l.metier)),
    ),
    parCode<{ code: string; nom: string | null }>("SELECT code, nom FROM taille WHERE code = ANY($1)", unique(lignes.map((l) => l.taille))),
    parCode<{ code: string; nom: string | null }>("SELECT code, nom FROM service WHERE code = ANY($1)", unique(lignes.map((l) => l.service))),
    parCode<{ code: string; dite: string | null; scene_avant: string | null }>("SELECT code, dite, scene_avant FROM douleur WHERE code = ANY($1)", unique(lignes.map((l) => l.douleur))),
    parCode<{ code: string; titre: string | null; probleme: string | null; ce_que_ca_change: string | null; sujet: string | null; sujet_titre: string | null }>(
      "SELECT c.code, c.titre, c.probleme, c.ce_que_ca_change, c.sujet, s.titre AS sujet_titre FROM cas_usage c LEFT JOIN sujet s ON s.code = c.sujet WHERE c.code = ANY($1)",
      unique(lignes.map((l) => l.cas_usage)),
    ),
    parCode<{ code: string; titre: string | null; ce_qui_change_pour_un_dirigeant: string | null; source: string | null }>(
      "SELECT code, titre, ce_qui_change_pour_un_dirigeant, source FROM actualite WHERE code = ANY($1)",
      unique(lignes.map((l) => l.actualite)),
    ),
    parCode<{ code: string; nom: string | null }>("SELECT code, nom FROM format_video WHERE code = ANY($1)", unique(lignes.map((l) => l.format))),
    parCode<{ code: string; famille: string | null; modele: string | null; exemple: string | null }>("SELECT code, famille, modele, exemple FROM accroche WHERE code = ANY($1)", unique(lignes.map((l) => l.accroche))),
  ]);
  const appels = new Map(bases.appels.map((a) => [a.code, a]));
  const avecMot = (t: string | null, mot: string | null) => (t && mot ? t.replaceAll("{MOT}", mot) : t);

  return lignes.map((l) => {
    const c = l.cas_usage ? cas.get(l.cas_usage) : undefined;
    const fins: SujetPropose["fins"] = {};
    for (const [reseau, code] of Object.entries(l.fins) as [keyof typeof l.fins, string][]) {
      const a = appels.get(code);
      const mot = l.mots[reseau] ?? null;
      fins[reseau] = { appel: code, type: a?.type ?? null, objectif: a?.objectif ?? null, dit: avecMot(a?.dit ?? null, mot), ecran: avecMot(a?.ecran ?? null, mot), mot } satisfies FinSujet;
    }
    const m = l.metier ? metiers.get(l.metier) : undefined;
    const a = l.actualite ? actualites.get(l.actualite) : undefined;
    const acc = accroches.get(l.accroche);
    return {
      rang: l.rang,
      signature: l.signature,
      parts: { metier: l.metier, taille: l.taille, service: l.service, douleur: l.douleur, cas_usage: l.cas_usage, actualite: l.actualite, format: l.format, structure: l.structure },
      type_contenu: l.type_contenu,
      reseaux: l.reseaux,
      metier: l.metier ? { code: l.metier, libelle: m?.nom ?? null, secteur: m?.secteur ?? null } : null,
      taille: l.taille ? { code: l.taille, libelle: tailles.get(l.taille)?.nom ?? null } : null,
      service: l.service ? { code: l.service, libelle: services.get(l.service)?.nom ?? null } : null,
      douleur: l.douleur ? { code: l.douleur, dite: douleurs.get(l.douleur)?.dite ?? null, scene_avant: douleurs.get(l.douleur)?.scene_avant ?? null } : null,
      cas_usage: l.cas_usage ? { code: l.cas_usage, titre: c?.titre ?? null, probleme: c?.probleme ?? null, ce_que_ca_change: c?.ce_que_ca_change ?? null } : null,
      sujet: c?.sujet ? { code: c.sujet, titre: c.sujet_titre } : null,
      actualite: l.actualite ? { code: l.actualite, titre: a?.titre ?? null, ce_qui_change: a?.ce_qui_change_pour_un_dirigeant ?? null, source: a?.source ?? null } : null,
      format: { code: l.format, libelle: formats.get(l.format)?.nom ?? null },
      accroche: { code: l.accroche, famille: l.structure, modele: acc?.modele ?? null, exemple: acc?.exemple ?? null },
      fins,
    };
  });
}

/** Note un sujet retenu au studio comme déjà fabriqué : il ne sera plus jamais proposé. Rejouer l'appel ne change rien. */
export async function retenirSujet(s: RetenirSujet): Promise<ReponseRetenir> {
  verifierSujet(s);
  return ecrireSujet(s);
}

/** Contrôles de forme d'un sujet à retenir : rien n'est écrit. */
function verifierSujet(s: RetenirSujet): void {
  const sig = signature(s.parts);
  if (sig !== s.signature) throw new ErreurPorte(400, "signature_incoherente", "La signature ne correspond pas à ses parts.");
  if (!s.parts.format) throw new ErreurPorte(400, "format_absent", "Le format est requis.");
  if (!s.parts.cas_usage && !s.parts.actualite) throw new ErreurPorte(400, "sujet_absent", "Un cas d'usage ou une nouveauté est requis.");
  const p = s.parts;
  // Une part nulle vaut « n'importe quelle valeur » au tirage : sans ces parts, la signature bloquerait bien plus que ce sujet.
  // La porte rend toujours `metier` et `structure` pour un cas d'usage, `structure` pour une nouveauté ; `douleur` peut être nulle (cas sans douleur).
  const requises = p.cas_usage ? (["metier", "structure"] as const) : (["structure"] as const);
  const manquantes = requises.filter((c) => !p[c]);
  if (manquantes.length) throw new ErreurPorte(400, "parts_absentes", `Ces parts sont requises : ${manquantes.join(", ")}.`);
}

async function ecrireSujet(s: RetenirSujet): Promise<ReponseRetenir> {
  const p = s.parts;
  const sig = signature(p);
  try {
    const ecrites = await requete<{ id: string }>(
      `INSERT INTO deja_fabrique (type_contenu, metier, taille, service, douleur, cas_usage, actualite, format, structure, signature, code_version, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (signature) DO NOTHING RETURNING id`,
      [
        s.type_contenu, p.metier, p.taille, p.service, p.douleur, p.cas_usage, p.cas_usage ? null : p.actualite, p.format, p.structure, sig,
        codeVersion.safeParse(s.reference_studio).success ? s.reference_studio : null,
        `Retenu au studio : ${s.reference_studio}`,
      ],
    );
    if (ecrites.length) await journaliser("deja_fabrique", `Retenu au studio (porte) : ${p.metier ?? p.actualite}, ${p.cas_usage ?? p.actualite}, ${p.format}.`, { cible: p.metier ?? undefined });
    return { signature: sig, deja: !ecrites.length };
  } catch (e) {
    if ((e as { code?: string }).code === "23503") throw new ErreurPorte(400, "code_inconnu", "Un code des parts n'existe pas dans les bases.");
    throw e;
  }
}

/**
 * Retient plusieurs sujets d'un coup (v1.1). Tous les sujets sont contrôlés avant la première écriture : un seul mauvais
 * et rien n'est noté. Puis chacun est noté comme `retenirSujet` (idempotent) : rejouer le lot rend `deja: true` partout.
 */
export async function retenirLot(l: RetenirLot): Promise<ReponseRetenirLot> {
  l.sujets.forEach(verifierSujet);
  const lignes: ReponseRetenir[] = [];
  for (const s of l.sujets) lignes.push(await ecrireSujet(s));
  const deja = lignes.filter((x) => x.deja).length;
  return { retenus: lignes.length - deja, deja, lignes };
}

export async function listerMetiers(): Promise<MetierPorte[]> {
  const lignes = await requete<{ code: string; nom: string | null; secteur: string | null; secteur_nom: string | null; allume: boolean; cas_sources: number }>(
    `SELECT m.code, m.nom, m.secteur, s.nom AS secteur_nom, m.allume,
            (SELECT count(*)::int FROM cas_usage c WHERE c.cible = m.code AND c.etat <> 'retire' AND btrim(coalesce(c.source, '')) <> '') AS cas_sources
       FROM metier m LEFT JOIN secteur s ON s.code = m.secteur
      WHERE m.etat <> 'retire' ORDER BY m.nom, m.code`,
  );
  return lignes.map((l) => ({ code: l.code, libelle: l.nom, secteur: { code: l.secteur, libelle: l.secteur_nom }, allume: l.allume === true, cas_sources: l.cas_sources }));
}
