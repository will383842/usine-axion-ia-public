/**
 * T02 · Import des bases dans PostgreSQL : les 9 fichiers de `bases/` s'importent deux fois de suite sans doublon
 * ni changement ; une ligne disparue passe en `retire` et n'est jamais supprimée ; un fichier refusé n'écrit rien ;
 * `metier.allume` n'est jamais écrit ; lignes de départ de `service` et `compte`.
 * Exige DATABASE_URL (PostgreSQL 16) ; sans elle, ces essais sont sautés (la CI la fournit toujours).
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TABLES_BASES_IMPORTEES } from "@/contrats";
import { importerBases, lireFichiersBases, type RapportImport } from "@/import/importer";
import type { FichierBase } from "@/import/preparation";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;
let fichiers: FichierBase[];
let premier: RapportImport;

async function compter(table: string, ou = "true"): Promise<number> {
  const r = await p.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${ou}`);
  return r.rows[0].n;
}

function remplacer(nom: string, avant: string | RegExp, apres: string): FichierBase[] {
  return fichiers.map((f) => (f.nom === nom ? { nom, texte: f.texte.replace(avant, apres) } : f));
}

describe.skipIf(!url)("import des bases", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    fichiers = await lireFichiersBases();
  });

  afterAll(async () => {
    await p?.end();
  });

  it("importe les 9 fichiers, puis rien ne change au second passage", async () => {
    expect(fichiers).toHaveLength(9);
    const debut = Date.now();
    premier = await importerBases(fichiers);
    const duree = Date.now() - debut;
    expect(premier.fichiersRefuses).toEqual([]);
    expect(premier.lignesRefusees).toEqual([]);
    expect(premier.ignorees).toEqual(["compte"]);
    expect(premier.tables.map((t) => t.table).sort()).toEqual([...TABLES_BASES_IMPORTEES].sort());
    for (const t of premier.tables) {
      expect(t.ajoutees, t.table).toBe(t.lues);
      expect(await compter(t.table), t.table).toBe(t.lues);
    }
    expect(premier.tables.find((t) => t.table === "cas_usage")?.lues).toBe(3072);
    expect(premier.depart).toEqual({ service: 4, compte: 6 });
    expect(duree).toBeLessThan(15_000);

    const modifieAvant = await p.query("SELECT max(modifie_le) AS m FROM cas_usage");
    const second = await importerBases(fichiers);
    expect(second.fichiersRefuses).toEqual([]);
    for (const t of second.tables) expect([t.table, t.ajoutees, t.mises_a_jour, t.retirees]).toEqual([t.table, 0, 0, 0]);
    expect(second.depart).toEqual({ service: 0, compte: 0 });
    for (const t of premier.tables) expect(await compter(t.table), t.table).toBe(t.lues);
    expect((await p.query("SELECT max(modifie_le) AS m FROM cas_usage")).rows[0].m).toEqual(modifieAvant.rows[0].m);
    expect(await compter("journal", "sujet = 'import'")).toBe(2);
  });

  it("n'importe pas la table compte des bases et pose les 6 comptes et les 4 services", async () => {
    expect(await compter("compte")).toBe(6);
    expect(await compter("compte", "code LIKE 'compte.%'")).toBe(0);
    expect((await p.query("SELECT code FROM service ORDER BY ordre")).rows.map((r) => r.code)).toEqual(["formation", "audit", "coaching", "integration"]);
  });

  it("ne touche jamais metier.allume", async () => {
    await p.query("UPDATE metier SET allume = true WHERE code = 'compta.expert-comptable'");
    const r = await importerBases(remplacer("1-cibles.md", /\| compta\.expert-comptable \| ([^|]*)\|/, "| compta.expert-comptable | $1 modifié |"));
    expect(r.tables.find((t) => t.table === "metier")?.mises_a_jour).toBe(1);
    expect((await p.query("SELECT allume FROM metier WHERE code = 'compta.expert-comptable'")).rows[0].allume).toBe(true);
    await importerBases(fichiers);
  });

  it("une ligne validée en base reste validée après un rechargement ; le journal note les colonnes changées", async () => {
    const code = "compta.expert-comptable";
    await p.query("UPDATE metier SET etat = 'valide', valide_le = '2026-10-12' WHERE code = $1", [code]);
    const r = await importerBases(remplacer("1-cibles.md", /\| compta\.expert-comptable \| ([^|]*)\|/, "| compta.expert-comptable | $1 revu |"));
    expect(r.tables.find((t) => t.table === "metier")?.mises_a_jour).toBe(1);
    const ligne = (await p.query("SELECT etat, valide_le FROM metier WHERE code = $1", [code])).rows[0];
    expect(ligne).toEqual({ etat: "valide", valide_le: "2026-10-12" });
    const note = (await p.query("SELECT donnees FROM journal WHERE sujet = 'import' AND cible = 'metier' ORDER BY id DESC LIMIT 1")).rows[0];
    expect(note.donnees).toEqual({ lignes: [{ code, colonnes: ["numero"] }] });

    const rejoue = await importerBases(fichiers);
    expect(rejoue.tables.find((t) => t.table === "metier")?.mises_a_jour).toBe(1);
    expect((await p.query("SELECT etat, valide_le FROM metier WHERE code = $1", [code])).rows[0]).toEqual(ligne);
  });

  it("passe en retire une ligne disparue, sans la supprimer, puis la rend si elle revient", async () => {
    const ligne = fichiers.find((f) => f.nom === "9-accroches.md")!.texte.split("\n").find((l) => l.startsWith("| accroche."))!;
    const code = ligne.split("|")[1].trim();
    const r = await importerBases(remplacer("9-accroches.md", `${ligne}\n`, ""));
    expect(r.tables.find((t) => t.table === "accroche")).toMatchObject({ retirees: 1, ajoutees: 0, mises_a_jour: 0 });
    expect(await compter("accroche")).toBe(17);
    expect((await p.query("SELECT etat FROM accroche WHERE code = $1", [code])).rows[0].etat).toBe("retire");

    const retour = await importerBases(fichiers);
    expect(retour.tables.find((t) => t.table === "accroche")).toMatchObject({ retirees: 0, mises_a_jour: 1 });
    expect((await p.query("SELECT etat FROM accroche WHERE code = $1", [code])).rows[0].etat).toBe("valide");
  });

  it("un fichier refusé n'écrit rien ; les autres passent", async () => {
    const texte = fichiers.find((f) => f.nom === "9-accroches.md")!.texte;
    const premiere = texte.split("\n").find((l) => l.startsWith("| accroche."))!;
    const r = await importerBases(remplacer("9-accroches.md", `${premiere}\n`, `${premiere}\n${premiere}\n`));
    expect(r.fichiersRefuses.map((f) => f.fichier)).toEqual(["9-accroches.md"]);
    expect(r.tables.some((t) => t.table === "accroche")).toBe(false);
    expect(await compter("accroche")).toBe(17);
    expect(await compter("accroche", "etat = 'retire'")).toBe(0);
    expect(r.tables.find((t) => t.table === "metier")).toMatchObject({ ajoutees: 0, mises_a_jour: 0, retirees: 0 });
  });
  it("L2-05 · après import, FA est actif mais proposé et hors lot, IV masqué ; rejouer ne change rien ; 30 tirages n'en contiennent aucun", async () => {
    const lire = async () => (await p.query("SELECT code, statut, en_lot, etat, modifie_le FROM format_video WHERE code IN ('facecam-animee', 'image-video') ORDER BY code")).rows;
    const avant = await lire();
    expect(avant.map(({ code, statut, en_lot, etat }) => ({ code, statut, en_lot, etat }))).toEqual([
      { code: "facecam-animee", statut: "actif", en_lot: "non", etat: "propose" },
      { code: "image-video", statut: "masque", en_lot: "non", etat: "propose" },
    ]);
    const rejoue = await importerBases(fichiers);
    expect(rejoue.tables.find((t) => t.table === "format_video")).toMatchObject({ ajoutees: 0, mises_a_jour: 0, retirees: 0 });
    expect(await lire()).toEqual(avant);

    const { tirerDepuisLaBase } = await import("@/tirage/charger");
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'tirage'");
    await p.query("UPDATE metier SET allume = true WHERE code = 'compta.expert-comptable'");
    const statuts = new Map((await p.query("SELECT code, statut FROM format_video")).rows.map((r) => [r.code, r.statut]));
    const formats = new Set<string>();
    for (let graine = 1; graine <= 30; graine++) for (const l of (await tirerDepuisLaBase(5, { graine })).lignes) formats.add(l.format);
    expect(formats.size).toBeGreaterThan(0);
    for (const f of formats) expect([f, statuts.get(f)]).toEqual([f, "actif"]);
    expect(formats.has("facecam-animee") || formats.has("image-video")).toBe(false);
  }, 60_000);
});
