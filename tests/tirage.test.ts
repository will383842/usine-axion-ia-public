/**
 * T08 · Tirage : aucun doublon d'un tirage à l'autre ; signature déjà fabriquée jamais tirée ; délai du cas ;
 * combinaisons épuisées signalées ; poids respectés ; métier éteint jamais tiré ; chacune des règles de fin ;
 * variété ; refus pris en compte. Données fictives ; les fins reprennent la forme de la base 7.
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { choisirFin, finsPermises, formatsDuTirage, signature, STATUT_EN_SERVICE, tirer, type BasesTirage, type HistoriqueTirage, type LigneTiree, type ReglagesTirage } from "@/tirage";
import type { Appel, ContexteFin } from "@/tirage/fins";
import { lireFichiersBases } from "@/import/importer";
import { preparer } from "@/import/preparation";

const MAINTENANT = new Date("2026-10-12T09:00:00Z");
const JOUR = 86_400_000;
const SERVICES = ["formation", "audit", "coaching", "integration"];
const FAMILLES = ["scène vécue", "constat partagé", "contre-pied", "énumération", "idée reçue corrigée"];

function appel(code: string, reseaux: string, type: string, objectif: string, autres: Partial<Appel> = {}): Appel {
  return { code, reseaux, cible: "clients", type_contenu: "video", type, objectif, dit: "Une phrase.", ecran: "Un écran", legende: null, mot: null, emplacement: null, ...autres };
}

const APPELS: Appel[] = [
  appel("fin-ig-mot-abonnement", "instagram", "commentaire", "MOT_CADEAU", { dit: "Abonnez-vous et écrivez {MOT} en commentaire : je vous l'envoie.", mot: "{MOT}" }),
  appel("fin-if-mot-envoi", "facebook", "commentaire", "MOT_CADEAU", { dit: "Écrivez {MOT} en commentaire. Je vous l'envoie.", mot: "{MOT}" }),
  appel("fin-if-enregistrement", "instagram ; facebook", "enregistrement", "ENREGISTRER"),
  appel("fin-if-envoi", "instagram ; facebook", "envoi", "PARTAGER"),
  appel("fin-if-question", "instagram ; facebook", "question", "QUESTION"),
  appel("fin-ig-lien", "instagram", "lien", "LIEN_PROFIL", { dit: "Le lien est dans mon profil.", emplacement: "profil" }),
  appel("fin-ig-rdv-seul", "instagram", "rendez-vous", "RENDEZ_VOUS", { dit: "Réservez votre diagnostic gratuit.", emplacement: "profil" }),
  appel("fin-ty-question", "tiktok ; youtube-shorts", "question", "QUESTION"),
  appel("fin-ty-lien-profil", "tiktok ; youtube-shorts", "lien", "LIEN_PROFIL", { dit: "Le lien est dans mon profil.", emplacement: "profil" }),
  appel("fin-ty-promesse-essai", "tiktok ; youtube-shorts", "envoi", "PARTAGER", { dit: "Écrivez OUI et je vous l'envoie." }),
  appel("fin-ty-bio-essai", "tiktok", "lien", "LIEN_PROFIL", { dit: "Le lien est dans la bio." }),
  appel("fin-li-question", "linkedin ; linkedin_page", "question", "QUESTION", { dit: "", ecran: "" }),
  appel("fin-li-dite-essai", "linkedin", "question", "QUESTION", { dit: "Dites-moi en commentaire." }),
  appel("fin-li-mot-texte", "linkedin", "cadeau", "MOT_CADEAU", { dit: "", ecran: "", mot: "{MOT}" }),
  appel("fin-if-app-question", "instagram ; facebook", "question", "QUESTION", { cible: "apporteurs" }),
];

const COMPTES: BasesTirage["comptes"] = [
  { code: "instagram:compte-essai", reseau: "instagram", lien_profil: "https://exemple.example.com/fr/guide-ia" },
  { code: "facebook:page-essai", reseau: "facebook", lien_profil: null },
  { code: "tiktok:compte-essai", reseau: "tiktok", lien_profil: "https://exemple.example.com/fr/guide-ia" },
  { code: "linkedin:profil-essai", reseau: "linkedin", lien_profil: null },
];

/** Des bases fictives : `nb` métiers, 2 cas par service et 1 cas phare, une douleur par service, 5 familles d'accroche. */
function bases(nb: number, autres: Partial<BasesTirage> = {}): BasesTirage {
  const metiers = Array.from({ length: nb }, (_, i) => ({ code: `essai.metier-${i}`, tailles_typiques: null }));
  return {
    metiers,
    tailles: ["TPE", "PME", "ETI", "GE"].map((code) => ({ code, poids: "1" })),
    services: SERVICES,
    douleurs: metiers.flatMap((m) => SERVICES.map((s, j) => ({ code: `${m.code}.d${j + 1}`, cible: m.code, services: s, tailles: null, type_contenu: null }))),
    cas: metiers.flatMap((m) => [
      ...SERVICES.flatMap((s) => [1, 2].map((k) => ({ code: `${m.code}.${s}.c0${k}`, cible: m.code, service: s, douleurs: null, phare: null, sujet: `a.${s}`, formats_conseilles: null }))),
      { code: `${m.code}.phare.p1`, cible: m.code, service: "integration", douleurs: null, phare: "rang 1", sujet: "a.integration", formats_conseilles: null },
    ]),
    accroches: FAMILLES.map((famille, i) => ({ code: `accroche.essai-${i}`, famille, types_contenu: "video ; post_texte" })).concat([
      { code: "accroche.nouveaute", famille: "actualité", types_contenu: "video" },
      { code: "accroche.recrutement-reseau", famille: "recrutement", types_contenu: "video" },
    ]),
    appels: APPELS,
    formats: [
      { code: "tableau-anime", type_contenu: "video", en_service: true },
      { code: "facecam", type_contenu: "video", en_service: true },
      { code: "ecran-partage", type_contenu: "video", en_service: false },
    ],
    actualites: [],
    comptes: COMPTES,
    motsBranches: [],
    ...autres,
  };
}

function reglages(autres: Partial<ReglagesTirage> = {}): ReglagesTirage {
  return {
    reseaux: ["instagram", "facebook", "tiktok"],
    poidsTailles: {},
    poidsServices: {},
    partsFormats: {
      instagram: { "tableau-anime": 50, facecam: 50, "ecran-partage": 100 },
      facebook: { "tableau-anime": 100 },
      tiktok: { "tableau-anime": 50, facecam: 50 },
    },
    rythmeActualites: 0,
    delaiCasJours: 30,
    finRendezVous: false,
    graine: 42,
    maintenant: MAINTENANT,
    ...autres,
  };
}

const VIDE: HistoriqueTirage = { lignes: [], dejaFabrique: [] };

function enHistorique(lignes: readonly LigneTiree[], le = MAINTENANT, refus: HistoriqueTirage["lignes"][number]["refus"] = null): HistoriqueTirage["lignes"] {
  return lignes.map((l) => ({ ...l, refus, le }));
}

describe("tirage · signatures", () => {
  it("le même tirage lancé deux fois ne rend aucun doublon", () => {
    const b = bases(6);
    const premier = tirer(20, reglages(), VIDE, b);
    expect(premier.lignes).toHaveLength(20);
    expect(new Set(premier.lignes.map((l) => l.signature)).size).toBe(20);
    const second = tirer(20, reglages(), { lignes: enHistorique(premier.lignes), dejaFabrique: [] }, b);
    expect(second.lignes).toHaveLength(20);
    const deja = new Set(premier.lignes.map((l) => l.signature));
    expect(second.lignes.filter((l) => deja.has(l.signature))).toEqual([]);
  });

  it("ne tire jamais une signature déjà fabriquée", () => {
    const b = bases(2, { formats: [{ code: "tableau-anime", type_contenu: "video", en_service: true }] });
    const r = reglages({ reseaux: ["instagram"], partsFormats: { instagram: { "tableau-anime": 100 } }, delaiCasJours: 0 });
    const tout = tirer(400, r, VIDE, b).lignes;
    const fabriquees = tout.slice(0, 10).map((l) => ({ signature: l.signature, cas_usage: l.cas_usage, format: l.format, le: new Date(MAINTENANT.getTime() - 400 * JOUR) }));
    for (let graine = 1; graine <= 5; graine++) {
      const lignes = tirer(30, { ...r, graine }, { lignes: [], dejaFabrique: fabriquees }, b).lignes;
      expect(lignes.filter((l) => fabriquees.some((f) => f.signature === l.signature))).toEqual([]);
    }
  });

  it("la signature réunit métier, taille, service, douleur, cas, format et famille d'accroche", () => {
    const base = { metier: "essai.m", taille: "TPE", service: "audit", douleur: "essai.m.d1", cas_usage: "essai.m.audit.c01", format: "tableau-anime", structure: "scène vécue" };
    expect(signature(base)).toBe("essai.m|tpe|audit|essai.m.d1|essai.m.audit.c01|tableau-anime|scène vécue");
    for (const cle of Object.keys(base) as (keyof typeof base)[]) expect(signature({ ...base, [cle]: "autre" })).not.toBe(signature(base));
  });
});

describe("tirage · délai du cas", () => {
  const b = bases(3);
  const casUtilise = "essai.metier-0.phare.p1";
  const recent = (jours: number): HistoriqueTirage => ({
    lignes: [],
    dejaFabrique: [{ signature: "deja|fait", cas_usage: casUtilise, format: "tableau-anime", le: new Date(MAINTENANT.getTime() - jours * JOUR) }],
  });

  it("un même cas ne revient dans un autre format qu'après le délai", () => {
    for (let graine = 1; graine <= 10; graine++) {
      const lignes = tirer(30, reglages({ graine }), recent(10), b).lignes;
      expect(lignes.filter((l) => l.cas_usage === casUtilise && l.format !== "tableau-anime")).toEqual([]);
    }
    const apres = Array.from({ length: 10 }, (_, i) => tirer(30, reglages({ graine: i + 1 }), recent(31), b).lignes).flat();
    expect(apres.some((l) => l.cas_usage === casUtilise && l.format === "facecam")).toBe(true);
  });

  it("dans un même lot, un cas ne change pas de format", () => {
    const lignes = tirer(30, reglages(), VIDE, b).lignes;
    const formats = new Map<string, Set<string>>();
    for (const l of lignes) formats.set(l.cas_usage!, (formats.get(l.cas_usage!) ?? new Set()).add(l.format));
    for (const f of formats.values()) expect(f.size).toBe(1);
  });
});

describe("tirage · combinaisons épuisées", () => {
  it("rend moins de lignes et dit pourquoi, par métier", () => {
    const b = bases(2, { formats: [{ code: "tableau-anime", type_contenu: "video", en_service: true }] });
    const r = reglages({ reseaux: ["instagram"], partsFormats: { instagram: { "tableau-anime": 100 } }, delaiCasJours: 0 });
    let historique: HistoriqueTirage = VIDE;
    let dernier = tirer(30, r, historique, b);
    for (let i = 0; i < 100 && dernier.lignes.length; i++) {
      historique = { lignes: [...historique.lignes, ...enHistorique(dernier.lignes)], dejaFabrique: [] };
      dernier = tirer(30, { ...r, graine: i }, historique, b);
    }
    expect(dernier.lignes).toEqual([]);
    expect(dernier.pourquoi.map((p) => p.metier)).toEqual(expect.arrayContaining(["essai.metier-0", "essai.metier-1"]));
    expect(dernier.pourquoi.find((p) => p.metier === "essai.metier-0")?.message).toMatch(/Plus aucune combinaison neuve/);
    // Aucune signature n'est revenue au fil des tirages.
    const toutes = historique.lignes.map((l) => l.signature);
    expect(new Set(toutes).size).toBe(toutes.length);
  });

  it("un seul métier allumé : la variété limite le lot, et le tirage le dit", () => {
    const r = tirer(5, reglages(), VIDE, bases(1));
    expect(r.lignes).toHaveLength(1);
    expect(r.pourquoi[0]).toMatchObject({ metier: "essai.metier-0" });
    expect(r.pourquoi[0].message).toMatch(/variété/);
  });
});

describe("tirage · poids et métiers", () => {
  it("respecte les poids sur un grand tirage", () => {
    const b = bases(40);
    const r = reglages({ poidsServices: { formation: 3, audit: 1, coaching: 0, integration: 0 }, poidsTailles: { GE: 0 } });
    const lignes = Array.from({ length: 20 }, (_, i) => tirer(30, { ...r, graine: i + 1 }, VIDE, b).lignes).flat();
    expect(lignes.length).toBeGreaterThan(500);
    const par = (s: string) => lignes.filter((l) => l.service === s).length;
    expect(par("coaching") + par("integration")).toBe(0);
    expect(lignes.some((l) => l.taille === "GE")).toBe(false);
    const rapport = par("formation") / par("audit");
    expect(rapport).toBeGreaterThan(2.4);
    expect(rapport).toBeLessThan(3.7);
    const formats = lignes.filter((l) => l.format === "tableau-anime").length / lignes.length;
    // Parts : tableau 50 + 100 + 50, face caméra 50 + 50 → 2/3 de tableaux.
    expect(formats).toBeGreaterThan(0.6);
    expect(formats).toBeLessThan(0.73);
    expect(lignes.some((l) => l.format === "ecran-partage")).toBe(false);
  });

  it("tire les cas phares d'abord", () => {
    const lignes = tirer(30, reglages({ poidsServices: { formation: 0, audit: 0, coaching: 0 } }), VIDE, bases(10)).lignes;
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes.slice(0, 10)) expect(l.cas_usage).toMatch(/\.phare\./);
  });

  it("ne tire que les métiers voulus, et le public Clients seulement", () => {
    const lignes = tirer(10, reglages({ metiers: ["essai.metier-1", "essai.metier-2", "essai.metier-hors-liste"] }), VIDE, bases(5)).lignes;
    expect(new Set(lignes.map((l) => l.metier))).toEqual(new Set(["essai.metier-1", "essai.metier-2"]));
    for (const l of lignes) {
      expect(l.public).toBe("public.clients");
      expect(l.structure).not.toBe("recrutement");
      expect(Object.values(l.fins)).not.toContain("fin-if-app-question");
    }
  });

  it("place les nouveautés gardées à leur rythme", () => {
    const b = bases(6, { actualites: [{ code: "actu.2026-10-12.1", perime_le: "2026-10-20" }, { code: "actu.2026-10-12.2", perime_le: "2026-10-01" }] });
    const lignes = tirer(10, reglages({ rythmeActualites: 1 }), VIDE, b).lignes;
    expect(lignes.filter((l) => l.actualite)).toHaveLength(1);
    expect(lignes.find((l) => l.actualite)).toMatchObject({ actualite: "actu.2026-10-12.1", metier: null, structure: "actualité" });
    const deja = enHistorique(lignes.filter((l) => l.actualite));
    expect(tirer(10, reglages({ rythmeActualites: 1 }), { lignes: deja, dejaFabrique: [] }, b).lignes.filter((l) => l.actualite)).toEqual([]);
  });
});

describe("tirage · fins par réseau", () => {
  const ctx = (autres: Partial<ContexteFin> = {}): ContexteFin => ({
    reseau: "instagram",
    typeContenu: "video",
    comptes: COMPTES,
    motsBranches: [],
    finRendezVous: false,
    compte: { total: 0, mot: 0, enregistrerOuPartager: 0 },
    ...autres,
  });
  const codes = (c: ContexteFin) => finsPermises(APPELS, c).map((a) => a.code);
  const branche = [{ mot: "GUIDE", reseau: "instagram" as const, compte: "compte-essai" }];

  it("fin au mot seulement si le mot est branché sur le compte", () => {
    expect(codes(ctx())).not.toContain("fin-ig-mot-abonnement");
    expect(codes(ctx({ motsBranches: [{ mot: "GUIDE", reseau: "instagram", compte: "autre-compte" }] }))).not.toContain("fin-ig-mot-abonnement");
    expect(codes(ctx({ motsBranches: branche }))).toContain("fin-ig-mot-abonnement");
    expect(choisirFin(APPELS, ctx({ motsBranches: branche, compte: { total: 2, mot: 0, enregistrerOuPartager: 0 } }), () => 0)).toEqual({
      appel: "fin-ig-mot-abonnement",
      mot: "GUIDE",
    });
    // Facebook : aucune ligne de branchement, aucune fin au mot.
    expect(codes(ctx({ reseau: "facebook", motsBranches: branche }))).not.toContain("fin-if-mot-envoi");
  });

  it("fin au mot : 1 contenu sur 3 au plus sur 7 jours", () => {
    expect(choisirFin(APPELS, ctx({ motsBranches: branche, compte: { total: 3, mot: 1, enregistrerOuPartager: 0 } }), () => 0)?.appel).not.toBe("fin-ig-mot-abonnement");
    const b = bases(8, { motsBranches: branche });
    const r = reglages({ reseaux: ["instagram"], partsFormats: { instagram: { "tableau-anime": 100 } } });
    const lignes = tirer(30, r, VIDE, b).lignes;
    const auMot = lignes.filter((l) => l.fins.instagram === "fin-ig-mot-abonnement");
    expect(auMot.length).toBeGreaterThan(0);
    expect(auMot.length * 3).toBeLessThanOrEqual(lignes.length);
    for (const l of auMot) expect(l.mots.instagram).toBe("GUIDE");
    // Les 7 derniers jours comptent : 10 fins au mot récentes sur 10 contenus, aucune de plus.
    const recentes = enHistorique(lignes.slice(0, 10), new Date(MAINTENANT.getTime() - 2 * JOUR)).map((l) => ({ ...l, fins: { instagram: "fin-ig-mot-abonnement" } }));
    const suite = tirer(5, { ...r, graine: 7 }, { lignes: recentes, dejaFabrique: [] }, b).lignes;
    expect(suite.filter((l) => l.fins.instagram === "fin-ig-mot-abonnement")).toEqual([]);
  });

  it("LinkedIn : aucun appel dit, aucune fin au mot", () => {
    const li = codes(ctx({ reseau: "linkedin", motsBranches: branche }));
    expect(li).toEqual(["fin-li-question"]);
  });

  it("TikTok et Shorts : jamais de promesse d'envoi, jamais « bio »", () => {
    const tt = codes(ctx({ reseau: "tiktok", motsBranches: branche }));
    expect(tt).not.toContain("fin-ty-promesse-essai");
    expect(tt).not.toContain("fin-ty-bio-essai");
    expect(tt).toEqual(expect.arrayContaining(["fin-ty-question", "fin-ty-lien-profil"]));
  });

  it("fin « profil » seulement si le lien du profil est le bon", () => {
    expect(codes(ctx())).toContain("fin-ig-lien");
    const mauvais = COMPTES.map((c) => (c.reseau === "instagram" ? { ...c, lien_profil: "https://exemple.example.com/fr/autre" } : c));
    expect(codes(ctx({ comptes: mauvais }))).not.toContain("fin-ig-lien");
    expect(codes(ctx({ reseau: "youtube-shorts" }))).not.toContain("fin-ty-lien-profil");
  });

  it("fin « rendez-vous » éteinte tant que son interrupteur l'est", () => {
    expect(codes(ctx())).not.toContain("fin-ig-rdv-seul");
    // Allumée : il faut encore que le lien du profil mène à /fr/appel.
    expect(codes(ctx({ finRendezVous: true }))).not.toContain("fin-ig-rdv-seul");
    const versAppel = COMPTES.map((c) => (c.reseau === "instagram" ? { ...c, lien_profil: "https://exemple.example.com/fr/appel?depuis=video-instagram" } : c));
    expect(codes(ctx({ finRendezVous: true, comptes: versAppel }))).toContain("fin-ig-rdv-seul");
    const lignes = tirer(30, reglages(), VIDE, bases(6));
    expect(lignes.lignes.flatMap((l) => Object.values(l.fins))).not.toContain("fin-ig-rdv-seul");
  });

  it("« enregistrez » et « partagez » : 1 contenu sur 3 au plus", () => {
    const plein = ctx({ reseau: "facebook", compte: { total: 2, mot: 0, enregistrerOuPartager: 1 } });
    for (let i = 0; i < 10; i++) expect(["fin-if-enregistrement", "fin-if-envoi"]).not.toContain(choisirFin(APPELS, plein, () => i / 10)?.appel);
    const lignes = tirer(30, reglages(), VIDE, bases(8)).lignes;
    for (const r of ["instagram", "facebook"] as const) {
      const n = lignes.filter((l) => ["fin-if-enregistrement", "fin-if-envoi"].includes(l.fins[r] ?? "")).length;
      expect(n * 3).toBeLessThanOrEqual(lignes.filter((l) => l.fins[r]).length);
    }
  });
});

describe("tirage · variété", () => {
  it("jamais deux fois de suite le même métier, la même taille ou la même structure ; 40 % au plus d'une structure", () => {
    for (let graine = 1; graine <= 5; graine++) {
      const lignes = tirer(30, reglages({ graine }), VIDE, bases(5)).lignes;
      expect(lignes).toHaveLength(30);
      for (let i = 1; i < lignes.length; i++) {
        expect(lignes[i].metier).not.toBe(lignes[i - 1].metier);
        expect(lignes[i].taille).not.toBe(lignes[i - 1].taille);
        expect(lignes[i].structure).not.toBe(lignes[i - 1].structure);
      }
      const parStructure = new Map<string, number>();
      for (const l of lignes) parStructure.set(l.structure, (parStructure.get(l.structure) ?? 0) + 1);
      for (const n of parStructure.values()) expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("tient compte de la dernière ligne déjà commandée", () => {
    const premier = tirer(1, reglages(), VIDE, bases(3)).lignes;
    const suivant = tirer(1, reglages({ graine: 9 }), { lignes: enHistorique(premier), dejaFabrique: [] }, bases(3)).lignes;
    expect(suivant[0].metier).not.toBe(premier[0].metier);
    expect(suivant[0].taille).not.toBe(premier[0].taille);
  });
});

describe("tirage · refus", () => {
  it("un cas refusé (faux ou douteux, déjà vu) ne revient plus ; une accroche faible non plus", () => {
    const b = bases(4);
    const premier = tirer(8, reglages(), VIDE, b).lignes;
    const refuses = [...enHistorique(premier.slice(0, 2), MAINTENANT, "faux_ou_douteux"), ...enHistorique(premier.slice(2, 3), MAINTENANT, "deja_vu")];
    const accroche = enHistorique(premier.slice(3, 4), MAINTENANT, "accroche_faible");
    const historique = { lignes: [...refuses, ...accroche, ...enHistorique(premier.slice(4))], dejaFabrique: [] };
    const ecartes = new Set(refuses.map((l) => l.cas_usage));
    for (let graine = 1; graine <= 10; graine++) {
      const lignes = tirer(30, reglages({ graine, delaiCasJours: 0 }), historique, b).lignes;
      expect(lignes.filter((l) => ecartes.has(l.cas_usage))).toEqual([]);
      expect(lignes.filter((l) => l.accroche === premier[3].accroche)).toEqual([]);
    }
  });

  it("un métier refusé « hors cible » est tiré moins souvent", () => {
    const b = bases(2);
    const modele = tirer(1, reglages(), VIDE, b).lignes[0];
    const il_y_a = new Date(MAINTENANT.getTime() - 60 * JOUR);
    const refus = [0, 1, 2].map((i) => ({ ...modele, metier: "essai.metier-0", signature: `refus-${i}`, fins: {}, refus: "hors_cible" as const, le: il_y_a }));
    const premieres = (historique: HistoriqueTirage["lignes"]) =>
      Array.from({ length: 300 }, (_, i) => tirer(1, reglages({ graine: i + 1 }), { lignes: historique, dejaFabrique: [] }, b).lignes[0]);
    const part = (lignes: LigneTiree[]) => lignes.filter((l) => l.metier === "essai.metier-0").length / lignes.length;
    // Une ligne neutre ferme l'historique, pour que la variété n'écarte aucun des deux métiers.
    const neutre = { ...refus[0], metier: null, taille: null, structure: null, refus: null, signature: "neutre", le: MAINTENANT };
    const sans = part(premieres([{ ...neutre, refus: null }]));
    const avec = part(premieres([...refus, neutre]));
    expect(sans).toBeGreaterThan(0.4);
    // Trois refus : poids 1/8 contre 1, soit une part attendue de 1/9.
    expect(avec).toBeGreaterThan(0.03);
    expect(avec).toBeLessThan(0.2);
  });
});

// Métier éteint, par la base : seuls les métiers allumés par Will entrent au tirage.
const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("tirage · depuis la base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("INSERT INTO secteur (code, nom) VALUES ('essai', 'Essai')");
    for (const [i, s] of SERVICES.entries()) await p.query("INSERT INTO service (code, nom, ordre) VALUES ($1, $1, $2)", [s, i]);
    for (const [code, allume] of [["essai.allume", true], ["essai.eteint", false], ["essai.allume-2", true]] as const) {
      await p.query("INSERT INTO metier (code, secteur, nom, allume, etat) VALUES ($1, 'essai', $1, $2, 'valide')", [code, allume]);
      for (const s of SERVICES) {
        await p.query("INSERT INTO douleur (code, cible, services, etat) VALUES ($1, $2, $3, 'valide')", [`${code}.d${SERVICES.indexOf(s) + 1}`, code, s]);
        await p.query("INSERT INTO cas_usage (code, cible, service, etat) VALUES ($1, $2, $3, 'valide')", [`${code}.${s}.c01`, code, s]);
      }
    }
    for (const t of ["TPE", "PME", "ETI", "GE"]) await p.query("INSERT INTO taille (code, poids, actif) VALUES ($1, '1', 'oui')", [t]);
    for (const [i, f] of FAMILLES.entries()) await p.query("INSERT INTO accroche (code, famille, types_contenu, etat) VALUES ($1, $2, 'video', 'valide')", [`accroche.essai-${i}`, f]);
    await p.query("INSERT INTO format_video (code, statut, en_lot, etat) VALUES ('tableau-anime', 'actif', 'oui', 'valide'), ('facecam', 'actif', 'non', 'valide')");
    await p.query(
      "INSERT INTO appel (code, reseaux, cible, type_contenu, type, objectif, dit, etat) VALUES ('fin-if-question', 'instagram ; facebook', 'clients', 'video', 'question', 'QUESTION', 'Et chez vous ?', 'valide'), ('fin-ty-question', 'tiktok ; youtube-shorts', 'clients', 'video', 'question', 'QUESTION', 'Et chez vous ?', 'valide')",
    );
  });

  afterAll(async () => {
    await p?.end();
  });

  it("éteint, le tirage ne rend rien ; allumé, il ne tire jamais un métier éteint", async () => {
    const { tirerDepuisLaBase } = await import("@/tirage/charger");
    const eteint = await tirerDepuisLaBase(5, { graine: 1 });
    expect(eteint.lignes).toEqual([]);
    expect(eteint.pourquoi[0].message).toMatch(/éteint/);
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'tirage'");
    const lignes = (await Promise.all([1, 2, 3, 4, 5].map((graine) => tirerDepuisLaBase(10, { graine })))).flatMap((r) => r.lignes);
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes.some((l) => l.metier === "essai.eteint")).toBe(false);
    expect(new Set(lignes.map((l) => l.format))).toEqual(new Set(["tableau-anime"]));
    expect(new Set(lignes.flatMap((l) => l.reseaux))).toEqual(new Set(["instagram", "facebook", "youtube-shorts"]));
  });

  it("un métier, une douleur ou un cas « propose » n'est jamais tiré (seuls les validés le sont)", async () => {
    const { chargerBases } = await import("@/tirage/charger");
    // Lignes fictives laissées à l'état par défaut (« propose »), sur un métier allumé et sur un métier validé.
    await p.query("INSERT INTO metier (code, secteur, nom, allume) VALUES ('essai.propose', 'essai', 'Essai', true)");
    await p.query("INSERT INTO douleur (code, cible, services) VALUES ('essai.allume.dp', 'essai.allume', 'audit')");
    await p.query("INSERT INTO cas_usage (code, cible, service) VALUES ('essai.allume.audit.cp', 'essai.allume', 'audit')");
    await p.query("INSERT INTO douleur (code, cible, services) VALUES ('essai.propose.d1', 'essai.propose', 'audit')");
    await p.query("INSERT INTO cas_usage (code, cible, service) VALUES ('essai.propose.audit.c01', 'essai.propose', 'audit')");
    const b = await chargerBases();
    expect(b.metiers.map((m) => m.code)).not.toContain("essai.propose");
    expect(b.douleurs.map((d) => d.code)).not.toContain("essai.allume.dp");
    expect(b.cas.map((c) => c.code)).not.toContain("essai.allume.audit.cp");
    expect(b.cas.length).toBeGreaterThan(0);
    // Un métier demandé par la porte du studio reste soumis à la même règle.
    expect((await chargerBases(["essai.propose", "essai.allume"])).metiers.map((m) => m.code)).toEqual(["essai.allume"]);
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'tirage'");
    const { tirerDepuisLaBase } = await import("@/tirage/charger");
    const lignes = (await Promise.all([1, 2, 3, 4, 5].map((graine) => tirerDepuisLaBase(10, { graine })))).flatMap((r) => r.lignes);
    expect(lignes.some((l) => l.metier === "essai.propose" || l.douleur === "essai.allume.dp" || l.cas_usage === "essai.allume.audit.cp")).toBe(false);
  });

  it("refuse en base une signature déjà commandée", async () => {
    const { tirerDepuisLaBase } = await import("@/tirage/charger");
    const [l] = (await tirerDepuisLaBase(1, { graine: 3 })).lignes;
    await p.query("INSERT INTO lot (id, numero, nombre, plafond_eur) VALUES ('L1', 1, 3, 5)");
    const ecrire = (id: string, rang: number) =>
      p.query("INSERT INTO lot_ligne (id, lot, rang, type_contenu, format, metier, taille, service, douleur, cas_usage, repere, signature) VALUES ($1, 'L1', $2, 'video', $3, $4, $5, $6, $7, $8, $9, $10)", [
        id, rang, l.format, l.metier, l.taille, l.service, l.douleur, l.cas_usage, `usine:${id}`, l.signature,
      ]);
    await ecrire("L1-1", 1);
    await expect(ecrire("L1-2", 2)).rejects.toThrow(/lot_ligne_signature/);
    const apres = (await tirerDepuisLaBase(10, { graine: 3 })).lignes;
    expect(apres.map((x) => x.signature)).not.toContain(l.signature);
  });
});

describe.skipIf(!existsSync("bases"))("tirage · base 5 réelle (L2-05)", () => {
  const INTERDITS = new Set(["facecam-animee", "image-video"]);
  let videos: Parameters<typeof formatsDuTirage>[0] = [];
  let autres: Parameters<typeof formatsDuTirage>[1] = [];

  beforeAll(async () => {
    const preparation = preparer((await lireFichiersBases()).filter((f) => f.nom === "5-formats.md"));
    const table = (nom: string) => preparation.tables.find((t) => t.table === nom)!.lignes as never[];
    videos = table("format_video");
    autres = table("format_autre");
  });

  /** Chaque format reçoit une part sur chaque réseau : seul `en_service` peut l'écarter. */
  function partsPartout(codes: string[]): ReglagesTirage["partsFormats"] {
    return Object.fromEntries(["instagram", "facebook", "tiktok"].map((r) => [r, Object.fromEntries(codes.map((c) => [c, 100]))]));
  }

  it("FA est actif mais proposé et hors lot, IV masqué : aucun des deux n'est en service", () => {
    expect(videos.find((f) => f.code === "facecam-animee")).toMatchObject({ statut: "actif", etat: "propose", en_lot: "non" });
    expect(videos.find((f) => f.code === "image-video")).toMatchObject({ statut: "masque" });
    const enService = formatsDuTirage(videos, autres).filter((f) => f.en_service).map((f) => f.code);
    expect(enService).not.toContain("facecam-animee");
    expect(enService).not.toContain("image-video");
  });

  it("1 000 graines : aucun format masqué, réservé, bientôt ou plus tard, jamais FA ni IV", () => {
    // Contre-épreuve : toutes les lignes en lot et validées, plus une ligne « reserve » ; seul le statut peut encore écarter.
    const forcees = [...videos.map((f) => ({ ...f, en_lot: "oui", etat: "valide" as const })), { code: "essai-reserve", statut: "reserve", en_lot: "oui", etat: "valide" as const }];
    const statut = new Map(forcees.map((f) => [f.code, f.statut]));
    for (const [lignes, interditsAussi] of [[videos, true], [forcees, false]] as const) {
      const formats = formatsDuTirage(lignes, autres);
      const b = bases(2, { formats });
      const r = reglages({ partsFormats: partsPartout(formats.map((f) => f.code)) });
      const tires = new Set<string>();
      for (let graine = 1; graine <= 1000; graine++) for (const l of tirer(5, { ...r, graine }, VIDE, b).lignes) tires.add(l.format);
      expect(tires.size).toBeGreaterThan(0);
      for (const code of tires) expect([code, statut.get(code)]).toEqual([code, STATUT_EN_SERVICE]);
      if (interditsAussi) expect([...tires].filter((c) => INTERDITS.has(c))).toEqual([]);
    }
    }, 60_000);
});
