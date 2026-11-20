/**
 * SCC-1 · réserve R1 et exclusion des deux seconds codes, par le bouton des interrupteurs.
 * - TOTP sans téléphone confirmé : refusé, rien n'est écrit, rien au journal ;
 * - TOTP avec un téléphone confirmé : accepté ;
 * - courriel par le bouton : refusé (il ne s'allume que par l'essai réussi).
 * Exige DATABASE_URL (sinon sautés).
 */
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { utiliserPool } from "@/lib/base";
import { NOM_COOKIE_SESSION, signerJeton } from "@/lib/jeton-session";
import { jouerMigrations } from "@/lib/migrations";
import { REGLAGES_ARGON2 } from "@/lib/mot-de-passe";

const bocal = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (bocal.has(nom) ? { name: nom, value: bocal.get(nom) } : undefined),
    set: (nom: string, valeur: string) => bocal.set(nom, valeur),
  }),
  headers: async () => new Headers({ "x-real-ip": "198.51.100.7" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { changerInterrupteur } = await import("@/app/reglages/interrupteurs/actions");

const url = process.env.DATABASE_URL;
const TOTP = "connexion.second-code";
const COURRIEL = "connexion.second-code-courriel";
let p: Pool;

const etat = async (code: string) => (await p.query(`SELECT allume FROM interrupteur WHERE code = $1`, [code])).rows[0]?.allume;
const journal = async () => (await p.query(`SELECT count(*)::int AS n FROM journal WHERE sujet = 'interrupteur' AND cible = $1`, [TOTP])).rows[0].n;

describe.skipIf(!url)("interrupteurs de connexion", () => {
  beforeAll(async () => {
    const schema = `essai_${randomBytes(4).toString("hex")}`;
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    process.env.SESSION_SECRET = "s".repeat(48);
    process.env.USINE_PASSWORD_HASH_B64 = Buffer.from(await hash("une phrase assez longue pour essayer", REGLAGES_ARGON2)).toString("base64");
  });
  beforeEach(async () => {
    bocal.set(NOM_COOKIE_SESSION, await signerJeton({ jti: "s", rc: true }, 3600));
  });
  afterAll(async () => {
    delete process.env.USINE_PASSWORD_HASH_B64;
    await p.end();
  });

  it("TOTP sans téléphone : refusé, rien n'est écrit, rien au journal", async () => {
    await expect(changerInterrupteur(TOTP, true)).rejects.toThrow("Aucun téléphone n'est enregistré.");
    expect(await etat(TOTP)).toBe(false);
    expect(await journal()).toBe(0);
  });

  it("TOTP avec un téléphone confirmé : accepté", async () => {
    const [{ id }] = (await p.query(`INSERT INTO second_code (secret_chiffre, confirme_le) VALUES ('x', now()) RETURNING id::text AS id`)).rows;
    bocal.set(NOM_COOKIE_SESSION, await signerJeton({ jti: "s", rc: true, sc: id }, 3600));
    await changerInterrupteur(TOTP, true);
    expect(await etat(TOTP)).toBe(true);
    expect(await journal()).toBe(1);
    await p.query(`UPDATE interrupteur SET allume = false WHERE code = $1`, [TOTP]);
  });

  it("courriel par le bouton : refusé", async () => {
    await expect(changerInterrupteur(COURRIEL, true)).rejects.toThrow();
    expect(await etat(COURRIEL)).not.toBe(true);
  });
});
