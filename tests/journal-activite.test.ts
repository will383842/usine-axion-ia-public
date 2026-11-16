/**
 * UO-06 · Le journal d'activité se lit sans rien écrire : du plus récent au plus ancien, 50 lignes par page,
 * filtrable par sujet et par cible ; l'historique d'un lot reprend le lot et ses lignes ; aucune donnée de personne
 * n'est affichée. Données fictives. Les essais de base exigent DATABASE_URL (PostgreSQL 16).
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";
import { TAILLE_PAGE, correspondCible, masquerDonnees } from "@/journal";

describe("journal · règles", () => {
  it("masque email, telephone et nom, à tous les niveaux, sans toucher le reste", () => {
    const m = masquerDonnees({ email: "a@example.com", telephone: "0600000000", nom: "Exemple", Email: "b@example.com", lot: "L12", dedans: [{ nom: "X", n: 3 }] });
    expect(m).toEqual({ email: "•••", telephone: "•••", nom: "•••", Email: "•••", lot: "L12", dedans: [{ nom: "•••", n: 3 }] });
    expect(masquerDonnees(null)).toBeNull();
    expect(masquerDonnees("texte")).toBe("texte");
  });

  it("la cible d'un lot reprend le lot et ses lignes, pas un autre lot", () => {
    expect(correspondCible("L12", "L12")).toBe(true);
    expect(correspondCible("L12", "L12-3")).toBe(true);
    expect(correspondCible("L12", "L123")).toBe(false);
    expect(correspondCible("L12", "L1")).toBe(false);
  });

  it("50 lignes par page", () => {
    expect(TAILLE_PAGE).toBe(50);
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("journal · base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
  });
  afterAll(async () => {
    await p?.end();
    const admin = new Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it("lit du plus récent au plus ancien, par pages de 50, sans écrire", async () => {
    const { lireJournal } = await import("@/journal");
    for (let i = 1; i <= 120; i++) {
      await p.query("INSERT INTO journal (le, sujet, cible, message) VALUES (now() - ($1 || ' minutes')::interval, 'essai.suite', NULL, $2)", [String(1000 - i), `ligne ${i}`]);
    }
    const avant = (await p.query("SELECT count(*)::int AS n FROM journal")).rows[0].n;
    const p1 = await lireJournal({ sujet: "essai.suite", page: 1 });
    const p3 = await lireJournal({ sujet: "essai.suite", page: 3 });
    expect(p1.lignes).toHaveLength(50);
    expect(p1.lignes[0].message).toBe("ligne 120");
    expect(p1.lignes[49].message).toBe("ligne 71");
    expect(p1.suivante).toBe(true);
    expect(p3.lignes).toHaveLength(20);
    expect(p3.suivante).toBe(false);
    expect((await p.query("SELECT count(*)::int AS n FROM journal")).rows[0].n).toBe(avant);
  });

  it("l'historique d'un lot montre le lot et ses lignes, dans l'ordre", async () => {
    const { lireJournal } = await import("@/journal");
    await p.query(`INSERT INTO journal (le, sujet, cible, message) VALUES
      (now() - interval '3 hours', 'essai.lot', 'L12', 'lot commandé'),
      (now() - interval '2 hours', 'essai.lot', 'L12-1', 'ligne 1 prête'),
      (now() - interval '1 hours', 'essai.lot', 'L12-2', 'ligne 2 prête'),
      (now() - interval '1 hours', 'essai.lot', 'L123', 'autre lot'),
      (now() - interval '1 hours', 'essai.lot', 'L1', 'encore un autre')`);
    const r = await lireJournal({ cible: "L12" });
    expect(r.lignes.map((l) => l.message)).toEqual(["ligne 2 prête", "ligne 1 prête", "lot commandé"]);
  });

  it("masque les données de personne d'une ligne fictive", async () => {
    const { lireJournal } = await import("@/journal");
    await p.query(`INSERT INTO journal (sujet, cible, message, donnees) VALUES ('essai.masque', 'M1', 'demande', '{"email":"visiteur@example.com","telephone":"0600000000","nom":"Exemple","mot":"GUIDE"}')`);
    const r = await lireJournal({ sujet: "essai.masque" });
    const texte = JSON.stringify(r.lignes);
    expect(texte).not.toContain("visiteur@example.com");
    expect(texte).not.toContain("0600000000");
    expect(texte).not.toContain("Exemple");
    expect(r.lignes[0].donnees).toEqual({ email: "•••", telephone: "•••", nom: "•••", mot: "GUIDE" });
  });
});
