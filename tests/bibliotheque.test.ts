/** UO-03 · bibliothèque, « Refusés » et « Refaire ». Aucun appel réel. */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { filtresDepuis, PHRASE_ARRET_REFAIRE } from "@/bibliotheque/regles";

vi.mock("server-only", () => ({}));

const SOURCES = ["src/bibliotheque/index.ts", "src/bibliotheque/regles.ts", "src/app/bibliotheque/page.tsx", "src/app/bibliotheque/actions.ts"];

describe("bibliothèque · partie pure", () => {
  it("les filtres ne gardent que des valeurs connues", () => {
    expect(filtresDepuis({ metier: "compta.expert-comptable", reseau: "linkedin", type: "video" })).toEqual({ metier: "compta.expert-comptable", reseau: "linkedin", type: "video" });
    expect(filtresDepuis({ metier: "x'; --", reseau: "inconnu", type: ["video", "image"] })).toEqual({ metier: null, reseau: null, type: null });
  });
  it("aucun DELETE, TRUNCATE ni DROP dans les fichiers ajoutés, aucun montant", () => {
    for (const f of SOURCES) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/i);
      expect(s, f).not.toMatch(/cout_max_eur|plafond_eur[^,)]*\bSELECT|toFixed|€/);
    }
  });
});

const url = process.env.DATABASE_URL;
const schema = `bib_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("bibliothèque · en base", () => {
  const regler = (code: string, allume: boolean) => p.query("UPDATE interrupteur SET allume = $2 WHERE code = $1", [code, allume]);
  const ligne = async (id: string, etat: string, extra: { refus?: string | null; archive?: boolean; signature?: string | null } = {}) => {
    const lot = id.slice(0, id.indexOf("-"));
    await p.query(`INSERT INTO lot (id, numero, nombre, plafond_eur, etat) VALUES ($1, $2, 3, 10, 'commande') ON CONFLICT DO NOTHING`, [lot, Number(lot.slice(1))]);
    await p.query(
      `INSERT INTO lot_ligne (id, lot, rang, type_contenu, format, metier, sujet, reseaux, fins, repere, etat, refus, archive_le, signature, code_version, paquet)
       VALUES ($1, $2, $3, 'video', 'f1', 'essai.m1', NULL, '{linkedin,instagram}', '{"linkedin":"mot"}', $4, $5, $6, $7, $8, 'v1', '{"x":1}')`,
      [id, lot, Number(id.split("-")[1]), `usine:${id}`, etat, extra.refus ?? null, extra.archive ? new Date() : null, extra.signature ?? null],
    );
  };

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
    await ligne("L1-1", "fabriquee", { signature: "s1" });
    await ligne("L1-2", "publiee", { signature: "s2" });
    await ligne("L1-3", "a_coller", { signature: "s3" });
    await ligne("L1-4", "fabriquee", { archive: true, signature: "s4" });
    await ligne("L1-5", "refusee", { refus: "hors_cible", signature: "s5" });
    await p.query("SELECT setval('lot_numero', 100)");
    await regler("lots", true);
    await regler("arret.tout", false);
  });
  afterAll(async () => {
    await p?.end();
  });

  it("la bibliothèque liste fabriquées et publiées, sans archivées, filtrable, sans rien écrire", async () => {
    const { listerBibliotheque } = await import("@/bibliotheque");
    const avant = (await p.query("SELECT count(*)::int AS n FROM lot_ligne")).rows[0].n;
    const tout = await listerBibliotheque({ metier: null, reseau: null, type: null });
    expect(tout.map((l) => l.id).sort()).toEqual(["L1-1", "L1-2"]);
    expect(await listerBibliotheque({ metier: "autre", reseau: null, type: null })).toHaveLength(0);
    expect(await listerBibliotheque({ metier: null, reseau: "instagram", type: "video" })).toHaveLength(2);
    expect(await listerBibliotheque({ metier: null, reseau: "tiktok", type: null })).toHaveLength(0);
    expect((await p.query("SELECT count(*)::int AS n FROM lot_ligne")).rows[0].n).toBe(avant);
  });

  it("« Refusés » donne le motif, et le tirage garde la signature du refus en mémoire", async () => {
    const { listerRefuses } = await import("@/bibliotheque");
    const r = await listerRefuses();
    expect(r.map((l) => [l.id, l.motif])).toEqual([["L1-5", "Sujet hors cible"]]);
    const { chargerHistorique } = await import("@/tirage/charger");
    const h = await chargerHistorique();
    expect(h.lignes.find((l) => l.signature === "s5")?.refus).toBe("hors_cible");
  });

  it("« Refaire » crée une nouvelle ligne dans un lot brouillon, sans paquet ni code, et ne touche pas l'origine", async () => {
    const { refaire } = await import("@/bibliotheque");
    const avant = (await p.query("SELECT * FROM lot_ligne WHERE id = 'L1-1'")).rows[0];
    const r = await refaire("L1-1");
    expect(r.fait).toBe(true);
    const lignes = (await p.query("SELECT l.*, o.etat AS etat_lot FROM lot_ligne l JOIN lot o ON o.id = l.lot WHERE l.lot <> 'L1' ORDER BY l.id")).rows;
    expect(lignes).toHaveLength(1);
    const n = lignes[0];
    expect(n.etat_lot).toBe("brouillon");
    expect([n.metier, n.format, n.type_contenu, n.reseaux, n.fins]).toEqual([avant.metier, avant.format, avant.type_contenu, avant.reseaux, avant.fins]);
    expect([n.paquet, n.code_version, n.signature, n.etat, n.refus]).toEqual([null, null, null, "a_coller", null]);
    expect((await p.query("SELECT * FROM lot_ligne WHERE id = 'L1-1'")).rows[0]).toEqual(avant);
    // un second « Refaire » prend le rang suivant du même lot
    await refaire("L1-5");
    expect((await p.query("SELECT count(*)::int AS n FROM lot_ligne WHERE lot <> 'L1'")).rows[0].n).toBe(2);
    expect((await p.query("SELECT count(*)::int AS n FROM lot WHERE etat = 'brouillon'")).rows[0].n).toBe(1);
  });

  it("« Refaire » refuse une ligne à coller, archivée ou inconnue", async () => {
    const { refaire } = await import("@/bibliotheque");
    for (const id of ["L1-3", "L1-4", "L99-1", "n'importe quoi"]) expect((await refaire(id)).fait).toBe(false);
  });

  it("« Tout arrêter » allumé : aucune commande ne part", async () => {
    const { refaire } = await import("@/bibliotheque");
    const avant = (await p.query("SELECT count(*)::int AS n FROM lot_ligne")).rows[0].n;
    await regler("arret.tout", true);
    const r = await refaire("L1-2");
    await regler("arret.tout", false);
    expect(r).toEqual({ fait: false, message: PHRASE_ARRET_REFAIRE });
    expect((await p.query("SELECT count(*)::int AS n FROM lot_ligne")).rows[0].n).toBe(avant);
  });

  it("écran Lots éteint : rien ne part", async () => {
    const { refaire } = await import("@/bibliotheque");
    const avant = (await p.query("SELECT count(*)::int AS n FROM lot_ligne")).rows[0].n;
    await regler("lots", false);
    expect((await refaire("L1-2")).fait).toBe(false);
    await regler("lots", true);
    expect((await p.query("SELECT count(*)::int AS n FROM lot_ligne")).rows[0].n).toBe(avant);
  });
});
