/** UO-03 · bibliothèque, « Refusés » et « Refaire ». Aucun appel réel. */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { filtresDepuis, PHRASE_ARRET_REFAIRE, PHRASE_DEJA_REFAITE, PHRASE_ECRAN_ETEINT, PHRASE_LIGNE_INTROUVABLE } from "@/bibliotheque/regles";
import { signature, tirer, type BasesTirage, type ReglagesTirage } from "@/tirage";

vi.mock("server-only", () => ({}));

const SOURCES = ["src/bibliotheque/index.ts", "src/bibliotheque/regles.ts", "src/app/bibliotheque/page.tsx", "src/app/bibliotheque/actions.ts", "src/app/bibliotheque/BoutonRefaire.tsx"];

describe("bibliothèque · partie pure", () => {
  it("les filtres ne gardent que des valeurs connues", () => {
    expect(filtresDepuis({ metier: "compta.expert-comptable", reseau: "linkedin", type: "video" })).toEqual({ metier: "compta.expert-comptable", reseau: "linkedin", type: "video" });
    expect(filtresDepuis({ metier: "x'; --", reseau: "inconnu", type: ["video", "image"] })).toEqual({ metier: null, reseau: null, type: null });
  });
  it("aucun DELETE, TRUNCATE ni DROP dans les fichiers ajoutés, aucun montant ni nombre de montant écrit", () => {
    for (const f of SOURCES) {
      const s = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(s, f).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/i);
      expect(s, f).not.toMatch(/cout_max_eur|toFixed|€|euros\(/);
      // le plafond n'est que recopié du lot d'origine (index.ts) ; jamais nommé ailleurs
      if (f !== "src/bibliotheque/index.ts") expect(s, f).not.toMatch(/plafond/i);
      // aucun littéral décimal (0.01, 2.5…) dans le code ajouté
      expect(s, f).not.toMatch(/(?<![\w.{])\d+[.,]\d+(?![\w.}])/);
    }
  });
});

const url = process.env.DATABASE_URL;
const schema = `bib_${randomBytes(4).toString("hex")}`;
let p: Pool;

const MAINTENANT = new Date("2026-10-12T09:00:00Z");
const BASES: BasesTirage = {
  metiers: [{ code: "essai.m1", tailles_typiques: null }],
  tailles: [{ code: "TPE", poids: "1" }],
  services: ["formation"],
  douleurs: [{ code: "essai.m1.d1", cible: "essai.m1", services: "formation", tailles: null, type_contenu: null }],
  cas: ["c1", "c2", "c3", "c4"].map((k) => ({ code: `essai.m1.${k}`, cible: "essai.m1", service: "formation", douleurs: null, phare: null, sujet: k === "c1" ? "essai.sujet-r" : "essai.sujet-a", formats_conseilles: null })),
  accroches: ["scène vécue", "constat partagé", "contre-pied", "énumération", "idée reçue corrigée"].map((famille, i) => ({ code: `accroche.essai-${i}`, famille, types_contenu: "video" })),
  appels: [
    { code: "fin-if-question", reseaux: "instagram ; facebook", cible: "clients", type_contenu: "video", type: "question", objectif: "QUESTION", dit: "Une phrase.", ecran: "Un écran", legende: null, mot: null, emplacement: null },
    { code: "fin-ig-lien", reseaux: "instagram", cible: "clients", type_contenu: "video", type: "lien", objectif: "LIEN_PROFIL", dit: "Le lien est dans mon profil.", ecran: "Un écran", legende: null, mot: null, emplacement: "profil" },
  ],
  formats: [{ code: "tableau-anime", type_contenu: "video", en_service: true }],
  actualites: [],
  comptes: [{ code: "instagram:compte-essai", reseau: "instagram", lien_profil: "https://exemple.example.com/fr/guide-ia" }],
  motsBranches: [],
};
const REGLAGES: ReglagesTirage = {
  reseaux: ["instagram"],
  poidsTailles: {},
  poidsServices: {},
  partsFormats: { instagram: { "tableau-anime": 100 } },
  rythmeActualites: 0,
  delaiCasJours: 0,
  finRendezVous: false,
  repetitionsPermises: ["metier", "taille"],
  maintenant: MAINTENANT,
};

describe.skipIf(!url)("bibliothèque · en base", () => {
  const regler = (code: string, allume: boolean) => p.query("UPDATE interrupteur SET allume = $2 WHERE code = $1", [code, allume]);
  const compter = async (sql: string) => (await p.query(sql)).rows[0].n as number;
  const ligne = async (
    id: string,
    etat: string,
    extra: { refus?: string | null; archive?: boolean; signature?: string | null; sujet?: string | null; cas?: string | null } = {},
  ) => {
    const lot = id.slice(0, id.indexOf("-"));
    await p.query(
      `INSERT INTO lot (id, numero, nombre, plafond_eur, reglages, etat) VALUES ($1, $2, 5, 10, '{"reseaux":["linkedin","instagram"],"poidsTailles":{},"poidsServices":{},"parts":{},"rythmes":{},"rythmeActualites":0,"coutMaxLigneEur":1}'::jsonb, 'commande') ON CONFLICT DO NOTHING`,
      [lot, Number(lot.slice(1))],
    );
    await p.query(
      `INSERT INTO lot_ligne (id, lot, rang, type_contenu, format, metier, sujet, cas_usage, structure, reseaux, fins, repere, etat, refus, archive_le, signature, code_version, paquet)
       VALUES ($1, $2, $3, 'video', 'f1', 'essai.m1', $9, $10, 'scène vécue', '{linkedin,instagram}', '{"linkedin":"mot"}', $4, $5, $6, $7, $8, 'v1', '{"x":1}')`,
      [id, lot, Number(id.split("-")[1]), `usine:${id}`, etat, extra.refus ?? null, extra.archive ? new Date() : null, extra.signature ?? null, extra.sujet ?? null, extra.cas ?? null],
    );
  };
  const reprises = async (origine: string) => (await p.query("SELECT * FROM lot WHERE reglages ->> 'reprise_de' = $1 ORDER BY numero", [origine])).rows;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("INSERT INTO metier (code, secteur, nom, allume, etat) VALUES ('essai.m1', 'essai', 'Métier un', true, 'valide')");
    await p.query("INSERT INTO sujet (code) VALUES ('essai.sujet-a'), ('essai.sujet-r')");
    await p.query("INSERT INTO cas_usage (code, cible, service, sujet, etat) VALUES ('essai.m1.c1', 'essai.m1', 'formation', 'essai.sujet-r', 'valide')");
    await ligne("L1-1", "fabriquee", { signature: "s1", sujet: "essai.sujet-a" });
    await ligne("L1-2", "publiee", { signature: "s2" });
    await ligne("L1-3", "a_coller", { signature: "s3" });
    await ligne("L1-4", "fabriquee", { archive: true, signature: "s4" });
    await ligne("L1-5", "refusee", { refus: "deja_vu", signature: signature({ metier: "essai.m1", taille: null, service: null, douleur: null, cas_usage: "essai.m1.c1", format: "tableau-anime", structure: "scène vécue" }), sujet: "essai.sujet-r", cas: "essai.m1.c1" });
    await p.query("SELECT setval('lot_numero', 100)");
    await regler("lots", true);
    await regler("tirage", true);
    await regler("arret.tout", false);
  });
  afterAll(async () => {
    await p?.end();
  });

  it("la bibliothèque liste fabriquées et publiées, sans archivées, filtrable, sans rien écrire", async () => {
    const { listerBibliotheque } = await import("@/bibliotheque");
    const avant = await compter("SELECT count(*)::int AS n FROM lot_ligne");
    const tout = await listerBibliotheque({ metier: null, reseau: null, type: null });
    expect(tout.map((l) => l.id).sort()).toEqual(["L1-1", "L1-2"]);
    expect(await listerBibliotheque({ metier: "autre", reseau: null, type: null })).toHaveLength(0);
    expect(await listerBibliotheque({ metier: null, reseau: "instagram", type: "video" })).toHaveLength(2);
    expect(await listerBibliotheque({ metier: null, reseau: "tiktok", type: null })).toHaveLength(0);
    expect(await compter("SELECT count(*)::int AS n FROM lot_ligne")).toBe(avant);
  });

  it("« Refusés » donne le motif", async () => {
    const { listerRefuses } = await import("@/bibliotheque");
    expect((await listerRefuses()).map((l) => [l.id, l.motif])).toEqual([["L1-5", "Déjà vu"]]);
  });

  it("un sujet refusé n'est pas reproposé : le tirage, avec l'historique lu en base, n'en tire ni le cas ni la signature", async () => {
    const { chargerHistorique } = await import("@/tirage/charger");
    const h = await chargerHistorique();
    const refusee = h.lignes.find((l) => l.refus === "deja_vu");
    expect(refusee?.cas_usage).toBe("essai.m1.c1");
    const sansRefus = { ...h, lignes: h.lignes.map((l) => ({ ...l, refus: null, cas_usage: l.refus ? null : l.cas_usage, signature: l.refus ? null : l.signature })) };
    // témoin : sans le refus, ce cas est bien tiré par au moins une graine (sinon le test ne prouverait rien)
    const temoin = [1, 2, 3, 4, 5, 6].flatMap((graine) => tirer(3, { ...REGLAGES, graine }, sansRefus, BASES).lignes);
    expect(temoin.some((l) => l.cas_usage === "essai.m1.c1")).toBe(true);
    for (const graine of [1, 2, 3, 4, 5, 6]) {
      const r = tirer(3, { ...REGLAGES, graine }, h, BASES).lignes;
      expect(r.length).toBeGreaterThan(0);
      expect(r.filter((l) => l.cas_usage === "essai.m1.c1" || l.signature === refusee?.signature)).toEqual([]);
    }
  });

  it("« Refaire » range la reprise dans l'aperçu d'un lot brouillon : mêmes choix, aucune ligne écrite, plafond et nombre du lot d'origine", async () => {
    const { refaire } = await import("@/bibliotheque");
    const avant = (await p.query("SELECT * FROM lot_ligne WHERE id = 'L1-1'")).rows[0];
    const nb = await compter("SELECT count(*)::int AS n FROM lot_ligne");
    const r = await refaire("L1-1");
    expect(r.fait).toBe(true);
    expect(await compter("SELECT count(*)::int AS n FROM lot_ligne")).toBe(nb);
    const [lot] = await reprises("L1-1");
    expect(lot.etat).toBe("brouillon");
    expect([lot.nombre, lot.plafond_eur]).toEqual([5, "10.00"]);
    expect(lot.reglages.coutMaxLigneEur).toBe(1);
    const n = lot.reglages.apercu.lignes;
    expect(n).toHaveLength(1);
    expect([n[0].rang, n[0].metier, n[0].sujet, n[0].format, n[0].type_contenu, n[0].reseaux, n[0].fins]).toEqual([1, avant.metier, avant.sujet, avant.format, avant.type_contenu, avant.reseaux, avant.fins]);
    expect(n[0].sujet).toBe("essai.sujet-a");
    expect(n[0].signature).not.toBe(avant.signature);
    expect(n[0].signature.startsWith(`${avant.signature}|reprise-`)).toBe(true);
    expect(lot.reglages.apercu.ecartees).toContain(avant.signature);
    expect((await p.query("SELECT * FROM lot_ligne WHERE id = 'L1-1'")).rows[0]).toEqual(avant);
  });

  it("la reprise est visible, commandable puis archivable par l'écran Lots ; l'accueil ne compte aucune ligne à coller hors lot commandé", async () => {
    const { lireLot, commanderLot, archiverBrouillon } = await import("@/lots");
    const { refaire } = await import("@/bibliotheque");
    const [lot] = await reprises("L1-1");
    expect((await lireLot(lot.id))?.reglages.apercu?.lignes).toHaveLength(1);
    expect(await compter("SELECT count(*)::int AS n FROM lot_ligne l JOIN lot o ON o.id = l.lot WHERE l.etat = 'a_coller' AND o.etat <> 'commande'")).toBe(0);

    await commanderLot(lot.id);
    const commandee = (await p.query("SELECT * FROM lot_ligne WHERE lot = $1", [lot.id])).rows;
    expect(commandee).toHaveLength(1);
    expect([commandee[0].etat, commandee[0].paquet, commandee[0].code_version, commandee[0].metier, commandee[0].sujet]).toEqual(["a_coller", null, null, "essai.m1", "essai.sujet-a"]);
    expect((await p.query("SELECT etat FROM lot WHERE id = $1", [lot.id])).rows[0].etat).toBe("commande");

    // une fois la première reprise commandée, la même origine se refait encore, avec une autre signature
    expect((await refaire("L1-1")).fait).toBe(true);
    const [, seconde] = await reprises("L1-1");
    expect(seconde.reglages.apercu.lignes[0].signature).not.toBe(commandee[0].signature);
    await commanderLot(seconde.id);
    expect(await compter(`SELECT count(*)::int AS n FROM lot_ligne WHERE lot = '${seconde.id}'`)).toBe(1);

    expect((await refaire("L1-2")).fait).toBe(true);
    const [autre] = await reprises("L1-2");
    await archiverBrouillon(autre.id);
    expect((await p.query("SELECT archive_le FROM lot WHERE id = $1", [autre.id])).rows[0].archive_le).not.toBeNull();
    expect(await compter(`SELECT count(*)::int AS n FROM lot_ligne WHERE lot = '${autre.id}'`)).toBe(0);
  });

  it("deux « Refaire » de la même origine donnent une seule reprise : « déjà remise à refaire »", async () => {
    const { refaire } = await import("@/bibliotheque");
    const r = await Promise.all([refaire("L1-5"), refaire("L1-5")]);
    expect(r.filter((x) => x.fait)).toHaveLength(1);
    expect(r.find((x) => !x.fait)?.message).toBe(PHRASE_DEJA_REFAITE);
    expect(await reprises("L1-5")).toHaveLength(1);
    expect(await refaire("L1-5")).toEqual({ fait: false, message: PHRASE_DEJA_REFAITE });
    expect(await reprises("L1-5")).toHaveLength(1);
  });

  it("« Refaire » refuse une ligne à coller, archivée ou inconnue, avec la phrase « n'existe plus »", async () => {
    const { refaire } = await import("@/bibliotheque");
    for (const id of ["L1-3", "L1-4", "L99-1", "n'importe quoi"]) expect(await refaire(id)).toEqual({ fait: false, message: PHRASE_LIGNE_INTROUVABLE });
  });

  it("« Tout arrêter » allumé : aucune commande ne part", async () => {
    const { refaire } = await import("@/bibliotheque");
    const avant = await compter("SELECT count(*)::int AS n FROM lot");
    await regler("arret.tout", true);
    const r = await refaire("L1-2");
    await regler("arret.tout", false);
    expect(r).toEqual({ fait: false, message: PHRASE_ARRET_REFAIRE });
    expect(await compter("SELECT count(*)::int AS n FROM lot")).toBe(avant);
  });

  it("écran Lots éteint : rien ne part", async () => {
    const { refaire } = await import("@/bibliotheque");
    const avant = await compter("SELECT count(*)::int AS n FROM lot");
    await regler("lots", false);
    expect(await refaire("L1-2")).toEqual({ fait: false, message: PHRASE_ECRAN_ETEINT });
    await regler("lots", true);
    expect(await compter("SELECT count(*)::int AS n FROM lot")).toBe(avant);
  });
});
