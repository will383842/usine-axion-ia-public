/**
 * T24 · Les bases se chargent seules au démarrage : base vide → importée ; fichiers inchangés → pas de second
 * import ; `metier.allume` intact quand les fichiers changent.
 * Exige DATABASE_URL (PostgreSQL 16) ; sans elle, ces essais sont sautés (la CI la fournit toujours).
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importerSiBesoin } from "@/import/automatique";
import { lireFichiersBases } from "@/import/importer";
import { utiliserPool } from "@/lib/base";
import { demarrer } from "@/lib/demarrage";

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

const importsReussis = async () => (await p.query("SELECT count(*)::int AS n FROM journal WHERE sujet = 'import' AND cible = 'bases'")).rows[0].n;

// Sans le dossier bases/ (absent du dépôt public), ces essais sont sautés.
describe.skipIf(!url || !existsSync("bases"))("chargement automatique des bases", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
  });

  afterAll(async () => {
    await p?.end();
  });

  it("base vide : les bases sont importées au démarrage", async () => {
    const { bases } = await demarrer();
    expect(await bases).toBe("importees");
    expect((await p.query("SELECT count(*)::int AS n FROM metier")).rows[0].n).toBeGreaterThan(0);
    expect(await importsReussis()).toBe(1);
  }, 60_000);

  it("fichiers inchangés : pas de second import", async () => {
    const { bases } = await demarrer();
    expect(await bases).toBe("inchangees");
    expect(await importsReussis()).toBe(1);
  }, 60_000);

  it("fichiers changés : nouvel import, metier.allume intact", async () => {
    const code = "compta.expert-comptable";
    await p.query("UPDATE metier SET allume = true WHERE code = $1", [code]);
    const fichiers = (await lireFichiersBases()).map((f) =>
      f.nom === "1-cibles.md" ? { ...f, texte: f.texte.replace(/\| compta\.expert-comptable \| ([^|]*)\|/, "| compta.expert-comptable | $1 revu |") } : f,
    );
    expect(await importerSiBesoin(fichiers)).toBe("importees");
    expect(await importsReussis()).toBe(2);
    expect((await p.query("SELECT allume FROM metier WHERE code = $1", [code])).rows[0].allume).toBe(true);
    expect(await importerSiBesoin(fichiers)).toBe("inchangees");
  }, 60_000);
});
