/**
 * T05 · Opposition commune : `tous` vaut pour chaque canal ; empreinte calculée comme au site ;
 * une adresse saisie ne se retrouve nulle part en clair dans la base.
 * Les essais de base exigent DATABASE_URL (PostgreSQL 16) ; sans elle, ils sont sautés (la CI la fournit toujours).
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";
import { cleDeRecherche, empreinteAdresse } from "@/opposition/cle";
import { ajouterOpposition, estOpposee } from "@/opposition";

describe("empreinte d'une adresse", () => {
  it("est celle du site : minuscules, espaces retirés en début et fin, SHA-256 en hexadécimal", () => {
    // Valeur de référence : printf 'will@example.com' | sha256sum
    const attendue = "603b122a1854b10592a8802c94ae1ae6cd3fddf0293f74149e812eb05ce03a28";
    expect(empreinteAdresse("will@example.com")).toBe(attendue);
    expect(empreinteAdresse("  Will@Example.COM \n")).toBe(attendue);
  });
});

describe("clé reçue par estOpposee", () => {
  it("normalise un compte sans réseau ou avec « @ » en <reseau>:<compte> minuscules ; refuse une clé vide", () => {
    expect(cleDeRecherche("@Quelquun", "instagram")).toBe("instagram:quelquun");
    expect(cleDeRecherche(" Quelquun ", "instagram")).toBe("instagram:quelquun");
    expect(cleDeRecherche("Instagram:@Quelquun")).toBe("instagram:quelquun");
    expect(cleDeRecherche("instagram:quelquun", "facebook")).toBe("instagram:quelquun");
    expect(cleDeRecherche("Will@Example.com")).toBe(empreinteAdresse("will@example.com"));
    for (const vide of ["", "   ", "@", "instagram:", "instagram:@"]) expect(() => cleDeRecherche(vide, "instagram"), vide).toThrow();
    expect(() => cleDeRecherche("quelquun")).toThrow();
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("opposition en base", () => {
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
  });

  it("une personne opposée sur « tous » est opposée sur chaque canal ; sur un canal, seulement sur lui", async () => {
    expect(await ajouterOpposition({ saisie: "partout@example.com", canal: "tous", source: "will" })).toEqual({ ok: true, deja: false });
    for (const canal of ["instagram", "facebook", "email", "tous"] as const) {
      expect(await estOpposee(empreinteAdresse("partout@example.com"), canal), canal).toBe(true);
    }

    expect(await ajouterOpposition({ saisie: "@Quelquun", reseau: "instagram", canal: "instagram", source: "zernio-stop" })).toEqual({ ok: true, deja: false });
    expect(await estOpposee("instagram:quelquun", "instagram")).toBe(true);
    expect(await estOpposee("instagram:quelquun", "tous")).toBe(true);
    expect(await estOpposee("instagram:quelquun", "facebook")).toBe(false);
    expect(await estOpposee("instagram:personne", "instagram")).toBe(false);
    expect(await estOpposee("@Quelquun", "instagram")).toBe(true);
    expect(await estOpposee("quelquun", "tous", "instagram")).toBe(true);
    expect(await estOpposee("@quelquun", "facebook")).toBe(false);
    await expect(estOpposee("  ", "instagram")).rejects.toThrow();
  });

  it("ne garde aucune adresse saisie en clair, ni en base ni au journal", async () => {
    const adresse = "Secret.Personne@example.com";
    expect(await ajouterOpposition({ saisie: `  ${adresse} `, canal: "email", source: "will" })).toEqual({ ok: true, deja: false });
    expect(await ajouterOpposition({ saisie: adresse.toLowerCase(), canal: "email", source: "will" })).toEqual({ ok: true, deja: true });
    expect(await estOpposee(empreinteAdresse(adresse), "email")).toBe(true);

    const tables = await p.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
      [schema],
    );
    expect(tables.rows.length).toBeGreaterThan(20);
    for (const { table_name } of tables.rows) {
      const r = await p.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table_name}" t WHERE lower(t::text) LIKE '%' || $1 || '%' OR lower(t::text) LIKE '%secret.personne%'`, [
        adresse.toLowerCase(),
      ]);
      expect(r.rows[0].n, table_name).toBe(0);
    }
  });
});
