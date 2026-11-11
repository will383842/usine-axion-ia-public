/**
 * T09 · Commander un lot, branché sur la base.
 * - `tirerApercu()` : tire les contenus (src/tirage/) avec les réglages du lot et range l'aperçu dans un lot « brouillon »
 *   (aucune ligne écrite : un aperçu abandonné ne retient aucune signature) ;
 * - `remplacerLigne()` : tire un autre contenu à la place d'une ligne de l'aperçu ;
 * - `commanderLot()` : enregistre les lignes, en une transaction, après avoir revérifié le plafond, les métiers allumés
 *   et les signatures (l'unicité en base, migration 002, refuse toute signature déjà présente) ;
 * - `changerLigne()` : état d'une ligne (refusée avec une des six raisons) et code de la vidéo ; les refus pèsent sur
 *   le tirage suivant (src/tirage/ lit `lot_ligne.refus`).
 * Le plafond est aussi gardé en base (migration 019).
 */
import "server-only";
import { type EtatLotLigne, type Reseau, type TypeContenu } from "@/contrats";
import { depots, interrupteurAllume, journaliser, prochainLot, type DejaFabrique, type Lot, type LotLigne } from "@/donnees";
import { requete, transaction } from "@/lib/base";
import { lireReglagesTirage } from "@/reglages";
import { FORMATS_PART, type FormatPart, type RythmesParReseau } from "@/reglages/modele";
import { signature, tirer, type BasesTirage, type HistoriqueTirage, type LigneTiree, type ResultatTirage } from "@/tirage";
import { chargerBases, chargerHistorique, chargerReglages, INTERRUPTEUR_TIRAGE, RESEAUX_PAR_DEFAUT } from "@/tirage/charger";
import { FENETRE_REFUS_JOURS, INTERRUPTEUR_LOTS, alerteRefus, euros, verifierPlafond, type Commande } from "./regles";

export * from "./regles";

/** Une erreur à montrer telle quelle à Will. */
export class ErreurLot extends Error {}

/** Réglages rangés avec le lot (`lot.reglages`) ; l'aperçu n'y reste que tant que le lot est un brouillon. */
export interface ReglagesLot {
  reseaux: Reseau[];
  metiers?: string[];
  poidsTailles: Record<string, number>;
  poidsServices: Record<string, number>;
  /** Parts de format par réseau (Réglages › Parts) au moment de la commande. */
  parts: Record<string, Record<FormatPart, number>>;
  rythmes: RythmesParReseau;
  rythmeActualites: number;
  coutMaxLigneEur: number;
  apercu?: Apercu;
}

export interface Apercu {
  lignes: LigneTiree[];
  pourquoi: ResultatTirage["pourquoi"];
  /** Signatures remplacées : jamais retirées dans ce lot. */
  ecartees: string[];
}

export async function lotsAllume(): Promise<boolean> {
  return interrupteurAllume(INTERRUPTEUR_LOTS);
}

async function exigerAllume(): Promise<void> {
  if (!(await lotsAllume())) throw new ErreurLot("L'écran Lots est éteint : allumez-le dans Réglages › Interrupteurs.");
  if (!(await interrupteurAllume(INTERRUPTEUR_TIRAGE))) throw new ErreurLot("Le tirage est éteint : allumez-le dans Réglages › Interrupteurs.");
}

/** Les valeurs proposées par « Commander un lot » : celles de Réglages, sinon leurs défauts. */
export async function valeursParDefaut() {
  const [r, metiers] = await Promise.all([
    lireReglagesTirage(),
    requete<{ code: string; nom: string | null }>("SELECT code, nom FROM metier WHERE allume AND etat <> 'retire' ORDER BY nom, code"),
  ]);
  return { ...r, reseaux: RESEAUX_PAR_DEFAUT, metiers };
}

/** Parts de Réglages (par type de contenu) → parts par format en service, pour le tirage. */
function partsParFormat(bases: BasesTirage, parts: ReglagesLot["parts"], reseaux: Reseau[]) {
  const enService = bases.formats.filter((f) => f.en_service);
  const parType = (t: TypeContenu) => enService.filter((f) => f.type_contenu === t).length;
  return Object.fromEntries(
    reseaux.map((r) => [
      r,
      Object.fromEntries(
        enService.map((f) => {
          const part = (FORMATS_PART as readonly string[]).includes(f.type_contenu) ? (parts[r]?.[f.type_contenu as FormatPart] ?? 0) : 0;
          return [f.code, part / parType(f.type_contenu)];
        }),
      ),
    ]),
  ) as Partial<Record<Reseau, Record<string, number>>>;
}

/**
 * L'historique du tirage, plus : les vidéos saisies « déjà fabriqué » par sujet (étendues à chaque cas de ce sujet),
 * les lignes de l'aperçu en cours et les signatures écartées.
 */
async function historiquePourLot(bases: BasesTirage, apercu?: Apercu): Promise<HistoriqueTirage> {
  const h = await chargerHistorique();
  h.dejaFabrique.push(...(await dejaFabriqueParSujet(bases.cas)));
  if (apercu) {
    const le = new Date();
    for (const l of apercu.lignes) h.lignes.push({ ...l, refus: null, le });
    for (const s of apercu.ecartees) h.dejaFabrique.push({ signature: s, cas_usage: null, format: null, le });
  }
  return h;
}

/** Les vidéos saisies « déjà fabriqué » par sujet, étendues à chaque cas de ce sujet (même métier, même service s'il est dit). */
export async function dejaFabriqueParSujet(cas: Pick<BasesTirage["cas"][number], "code" | "cible" | "service" | "sujet">[]): Promise<HistoriqueTirage["dejaFabrique"]> {
  const parSujet = (await depots.deja_fabrique.lister({ inclureArchives: true })).filter((d) => d.sujet && !d.cas_usage && d.metier);
  const rendu: HistoriqueTirage["dejaFabrique"] = [];
  for (const d of parSujet) {
    for (const c of cas.filter((x) => x.cible === d.metier && x.sujet === d.sujet && (!d.service || x.service === d.service))) {
      const motif = signature({ metier: d.metier, taille: d.taille, service: c.service, douleur: d.douleur, cas_usage: c.code, format: d.format, structure: d.structure });
      rendu.push({ signature: motif, cas_usage: c.code, format: d.format, le: new Date(d.fabrique_le) });
    }
  }
  return rendu;
}

async function tirage(n: number, r: ReglagesLot, apercu?: Apercu): Promise<ResultatTirage> {
  const bases = await chargerBases();
  const reglages = await chargerReglages(bases, {
    reseaux: r.reseaux,
    metiers: r.metiers,
    poidsTailles: r.poidsTailles,
    poidsServices: r.poidsServices,
    partsFormats: partsParFormat(bases, r.parts, r.reseaux),
    rythmeActualites: r.rythmeActualites,
    graine: Math.floor(Math.random() * 2 ** 31),
  });
  return tirer(n, reglages, await historiquePourLot(bases, apercu), bases);
}

/** Tire l'aperçu d'un lot et le range dans un lot « brouillon ». Rend l'identifiant du lot. */
export async function tirerApercu(c: Commande): Promise<string> {
  await exigerAllume();
  const erreur = verifierPlafond(c.nombre, c.coutMaxLigneEur, c.plafondEur);
  if (erreur) throw new ErreurLot(erreur);
  const defauts = await lireReglagesTirage();
  const reglages: ReglagesLot = {
    reseaux: c.reseaux,
    metiers: c.metiers?.length ? c.metiers : undefined,
    poidsTailles: c.poidsTailles,
    poidsServices: c.poidsServices,
    parts: defauts.parts,
    rythmes: defauts.rythmes,
    rythmeActualites: c.rythmeActualites,
    coutMaxLigneEur: c.coutMaxLigneEur,
  };
  const resultat = await tirage(c.nombre, reglages);
  const { id, numero } = await prochainLot();
  await depots.lot.ecrire({
    id,
    numero,
    nombre: c.nombre,
    plafond_eur: String(c.plafondEur),
    etat: "brouillon",
    reglages: { ...reglages, apercu: { lignes: resultat.lignes, pourquoi: resultat.pourquoi, ecartees: [] } } as unknown as Record<string, unknown>,
  });
  await journaliser("lot", `Lot ${id} préparé : ${resultat.lignes.length} contenu(s) sur ${c.nombre} demandés, plafond ${euros(c.plafondEur)}.`, { cible: id });
  return id;
}

export async function lireLot(id: string): Promise<{ lot: Lot; reglages: ReglagesLot; lignes: LotLigne[] } | null> {
  const lot = await depots.lot.lire(id);
  if (!lot) return null;
  const lignes = lot.etat === "commande" ? await depots.lot_ligne.lister({ ou: { lot: id }, ordre: "rang", inclureArchives: true }) : [];
  return { lot, reglages: lot.reglages as unknown as ReglagesLot, lignes };
}

async function brouillon(id: string) {
  const l = await lireLot(id);
  if (!l || l.lot.archive_le) throw new ErreurLot("Lot introuvable.");
  if (l.lot.etat !== "brouillon" || !l.reglages.apercu) throw new ErreurLot("Ce lot est déjà commandé.");
  return { ...l, apercu: l.reglages.apercu };
}

/** Verrouille la ligne du lot jusqu'à la fin de la transaction : deux clics rapprochés ne se croisent pas. */
async function verrouillerLot(id: string): Promise<void> {
  await requete("SELECT 1 FROM lot WHERE id = $1 FOR UPDATE", [id]);
}

/** Tire un autre contenu à la place de la ligne `rang` de l'aperçu ; la ligne remplacée ne revient pas. */
export async function remplacerLigne(id: string, rang: number): Promise<void> {
  await exigerAllume();
  await transaction(async () => {
    await verrouillerLot(id);
    const { reglages, apercu } = await brouillon(id);
    const i = apercu.lignes.findIndex((l) => l.rang === rang);
    if (i < 0) throw new ErreurLot("Ligne introuvable.");
    const [nouvelle] = (await tirage(1, reglages, apercu)).lignes;
    if (!nouvelle) throw new ErreurLot("Aucun autre contenu neuf possible pour cette ligne : allumez d'autres métiers, ou commandez sans elle.");
    const ancienne = apercu.lignes[i];
    const lignes = apercu.lignes.with(i, { ...nouvelle, rang });
    const suite: Apercu = { ...apercu, lignes, ecartees: [...apercu.ecartees, ancienne.signature] };
    await depots.lot.modifier(id, { reglages: { ...reglages, apercu: suite } as unknown as Record<string, unknown> });
    await journaliser("lot", `Lot ${id} : ligne ${rang} remplacée.`, { cible: id });
  });
}

/** Retire une ligne de l'aperçu (elle ne sera pas commandée). */
export async function retirerLigneApercu(id: string, rang: number): Promise<void> {
  await exigerAllume();
  await transaction(async () => {
    await verrouillerLot(id);
    const { reglages, apercu } = await brouillon(id);
    const ancienne = apercu.lignes.find((l) => l.rang === rang);
    if (!ancienne) throw new ErreurLot("Ligne introuvable.");
    const lignes = apercu.lignes.filter((l) => l.rang !== rang).map((l, k) => ({ ...l, rang: k + 1 }));
    await depots.lot.modifier(id, { reglages: { ...reglages, apercu: { ...apercu, lignes, ecartees: [...apercu.ecartees, ancienne.signature] } } as unknown as Record<string, unknown> });
    await journaliser("lot", `Lot ${id} : ligne ${rang} retirée de l'aperçu.`, { cible: id });
  });
}

/**
 * Les signatures déjà commandées ou déjà fabriquées parmi `signatures` (une part « - » d'un déjà fabriqué vaut toute valeur) ;
 * un déjà fabriqué saisi par sujet vaut pour chaque cas de ce sujet, comme au tirage.
 */
async function signaturesPrises(signatures: string[], metiers: string[]): Promise<Set<string>> {
  const commandees = await requete<{ signature: string }>("SELECT signature FROM lot_ligne WHERE signature = ANY($1)", [signatures]);
  const deja = await requete<{ signature: string }>("SELECT signature FROM deja_fabrique");
  const cas = await requete<{ code: string; cible: string | null; service: string | null; sujet: string | null }>(
    "SELECT code, cible, service, sujet FROM cas_usage WHERE cible = ANY($1) AND sujet IS NOT NULL",
    [metiers],
  );
  const parSujet = await dejaFabriqueParSujet(cas);
  const motifs = [...deja, ...parSujet].map((d) => d.signature.split("|"));
  const prises = new Set(commandees.map((c) => c.signature));
  for (const s of signatures) {
    const parts = s.split("|");
    if (motifs.some((m) => m.length === parts.length && m.every((x, i) => x === parts[i] || x === "-"))) prises.add(s);
  }
  return prises;
}

/** Enregistre le lot : chaque ligne avec sa signature, son repère, sa fin par réseau et son coût maximum. */
export async function commanderLot(id: string): Promise<void> {
  await exigerAllume();
  await transaction(async () => {
    // Aucun « déjà fabriqué » ne s'ajoute pendant la commande : il serait comparé trop tard.
    await requete("LOCK TABLE deja_fabrique IN SHARE MODE");
    const [verrou] = await requete<{ etat: string }>("SELECT etat FROM lot WHERE id = $1 AND archive_le IS NULL FOR UPDATE", [id]);
    if (!verrou) throw new ErreurLot("Lot introuvable.");
    const { lot, reglages, apercu } = await brouillon(id);
    const lignes = apercu.lignes;
    if (!lignes.length) throw new ErreurLot("Ce lot n'a aucun contenu : il ne peut pas être commandé.");
    const erreur = verifierPlafond(lignes.length, reglages.coutMaxLigneEur, Number(lot.plafond_eur));
    if (erreur) throw new ErreurLot(erreur);

    const metiers = [...new Set(lignes.map((l) => l.metier).filter((m): m is string => m !== null))];
    const allumes = new Set((await requete<{ code: string }>("SELECT code FROM metier WHERE allume AND etat <> 'retire' AND code = ANY($1)", [metiers])).map((m) => m.code));
    const eteintes = lignes.filter((l) => l.metier && !allumes.has(l.metier));
    if (eteintes.length) throw new ErreurLot(`Ligne(s) ${eteintes.map((l) => l.rang).join(", ")} : métier éteint depuis l'aperçu. Remplacez-les.`);

    const prises = await signaturesPrises(lignes.map((l) => l.signature), metiers);
    const deja = lignes.filter((l) => prises.has(l.signature));
    if (deja.length) throw new ErreurLot(`Ligne(s) ${deja.map((l) => l.rang).join(", ")} : contenu déjà commandé ou déjà fabriqué. Remplacez-les.`);

    for (const l of lignes) {
      const idLigne = `${id}-${l.rang}`;
      await depots.lot_ligne.ecrire({
        id: idLigne,
        lot: id,
        rang: l.rang,
        type_contenu: l.type_contenu,
        format: l.format,
        public: l.public,
        metier: l.metier,
        taille: l.taille,
        service: l.service,
        douleur: l.douleur,
        cas_usage: l.cas_usage,
        sujet: l.sujet,
        actualite: l.actualite,
        accroche: l.accroche,
        structure: l.structure,
        reseaux: l.reseaux,
        fins: l.fins,
        repere: `usine:${idLigne}`,
        cout_max_eur: String(reglages.coutMaxLigneEur),
        signature: l.signature,
      });
    }
    const { apercu: _apercu, ...reste } = reglages;
    void _apercu;
    await requete("UPDATE lot SET etat = 'commande', commande_le = now(), reglages = $2, modifie_le = now() WHERE id = $1", [id, JSON.stringify(reste)]);
    const cumul = lignes.length * reglages.coutMaxLigneEur;
    await journaliser("lot", `Lot ${id} commandé : ${lignes.length} contenu(s), coût maximum ${euros(cumul)} pour un plafond de ${euros(Number(lot.plafond_eur))}.`, {
      cible: id,
      donnees: { lignes: lignes.length, cumul_eur: cumul, plafond_eur: Number(lot.plafond_eur) },
    });
  }).catch((e: unknown) => {
    if (e instanceof ErreurLot) throw e;
    const code = (e as { code?: string }).code;
    if (code === "23505") throw new ErreurLot("Un de ces contenus vient d'être commandé ailleurs : remplacez la ligne et recommencez.");
    if (code === "23514") throw new ErreurLot("Le cumul des coûts maximum dépasse le plafond du lot : rien n'a été commandé.");
    throw e;
  });
}

/** Archive un lot resté brouillon (rien n'a été commandé). */
export async function archiverBrouillon(id: string): Promise<void> {
  await exigerAllume();
  await brouillon(id);
  await depots.lot.archiver(id);
  await journaliser("lot", `Lot ${id} archivé sans être commandé.`, { cible: id });
}

/** État d'une ligne commandée et code de la vidéo recopié du studio. */
export async function changerLigne(idLigne: string, saisie: { etat: EtatLotLigne; refus: LotLigne["refus"]; codeVersion: string | null }): Promise<void> {
  if (!(await lotsAllume())) throw new ErreurLot("L'écran Lots est éteint : allumez-le dans Réglages › Interrupteurs.");
  const ligne = await depots.lot_ligne.lire(idLigne);
  if (!ligne || ligne.archive_le) throw new ErreurLot("Ligne introuvable.");
  await depots.lot_ligne.modifier(idLigne, { etat: saisie.etat, refus: saisie.refus, code_version: saisie.codeVersion });
  const changements = [
    ligne.etat !== saisie.etat || ligne.refus !== saisie.refus ? `état ${saisie.etat}${saisie.refus ? ` (${saisie.refus})` : ""}` : null,
    (ligne.code_version ?? null) !== saisie.codeVersion ? `code de la vidéo ${saisie.codeVersion ?? "effacé"}` : null,
  ].filter(Boolean);
  if (changements.length) await journaliser("lot", `Ligne ${idLigne} : ${changements.join(", ")}.`, { cible: idLigne });
}

/** L'alerte « refus au-dessus de 30 % » sur les lignes commandées depuis 30 jours. */
export async function alerteDesRefus(): Promise<string | null> {
  const lignes = await requete<{ etat: EtatLotLigne }>(
    `SELECT l.etat FROM lot_ligne l JOIN lot o ON o.id = l.lot
      WHERE l.archive_le IS NULL AND o.commande_le > now() - make_interval(days => $1)`,
    [FENETRE_REFUS_JOURS],
  );
  return alerteRefus(lignes.map((l) => l.etat));
}

/** Le journal d'un lot et de ses lignes, du plus récent au plus ancien. */
export async function journalDuLot(id: string) {
  return requete<{ le: Date; message: string }>("SELECT le, message FROM journal WHERE sujet = 'lot' AND (cible = $1 OR cible LIKE $2) ORDER BY le DESC, id DESC LIMIT 100", [id, `${id}-%`]);
}

// Déjà fabriqué -------------------------------------------------------------------------------------------

export interface SaisieDejaFabrique {
  type_contenu: TypeContenu;
  metier: string;
  taille: string | null;
  service: string | null;
  cas_usage: string | null;
  sujet: string | null;
  format: string;
  structure: string | null;
  code_version: string | null;
  fabrique_le: string | null;
  note: string | null;
}

/** Note une vidéo faite avant l'Usine (ou hors d'elle) pour qu'elle ne soit pas refaite. */
export async function ajouterDejaFabrique(s: SaisieDejaFabrique): Promise<DejaFabrique> {
  if (!(await lotsAllume())) throw new ErreurLot("L'écran Lots est éteint : allumez-le dans Réglages › Interrupteurs.");
  const metier = await depots.metier.lire(s.metier);
  if (!metier || metier.etat === "retire") throw new ErreurLot("Métier introuvable.");
  if (!s.cas_usage && !s.sujet) throw new ErreurLot("Choisissez un cas ou un sujet.");
  let service = s.service;
  if (s.cas_usage) {
    const cas = await depots.cas_usage.lire(s.cas_usage);
    if (!cas || cas.cible !== s.metier) throw new ErreurLot("Ce cas n'est pas un cas de ce métier.");
    service = cas.service;
  } else if (s.sujet && !(await depots.sujet.lire(s.sujet))) throw new ErreurLot("Sujet introuvable.");
  const sig = signature({ metier: s.metier, taille: s.taille, service, douleur: null, cas_usage: s.cas_usage ?? s.sujet, format: s.format, structure: s.structure });
  try {
    const ligne = await depots.deja_fabrique.ecrire({
      type_contenu: s.type_contenu,
      metier: s.metier,
      taille: s.taille,
      service,
      cas_usage: s.cas_usage,
      sujet: s.cas_usage ? null : s.sujet,
      format: s.format,
      structure: s.structure,
      signature: sig,
      code_version: s.code_version,
      fabrique_le: (s.fabrique_le ?? undefined) as unknown as Date,
      note: s.note,
    });
    await journaliser("deja_fabrique", `Déjà fabriqué noté : ${metier.nom ?? s.metier}, ${s.cas_usage ?? s.sujet}, ${s.format}.`, { cible: s.metier });
    return ligne;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ErreurLot("Ce contenu est déjà noté.");
    throw e;
  }
}

export async function listerDejaFabrique() {
  return depots.deja_fabrique.lister({ ordre: "cree_le", sens: "desc", limite: 200 });
}
