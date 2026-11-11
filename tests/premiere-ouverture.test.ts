/**
 * T15b · Première ouverture : refusée sans la variable ; acceptée une seule fois avec ; mot de passe trop court refusé ;
 * ensuite connexion acceptée avec ce mot de passe et refusée avec un mauvais ; un changement rend l'ancien jeton
 * caduc ; rien du mot de passe ni du hachage dans le journal. Exige DATABASE_URL (sinon sautés).
 * N-26 : le changement de mot de passe exige une session complète (second code enregistré d'abord).
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { utiliserPool } from "@/lib/base";
import { NOM_COOKIE_SESSION, verifierJeton } from "@/lib/jeton-session";
import { jouerMigrations } from "@/lib/migrations";
import { CLE_HACHAGE } from "@/lib/mot-de-passe";
import { codeAuPas, pasDe } from "@/auth/totp";

// Les services lisent cookies() et headers() : un bocal de cookies et une adresse par essai (limite d'essais).
const bocal = new Map<string, string>();
let ip = "198.51.100.1";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (bocal.has(nom) ? { name: nom, value: bocal.get(nom) } : undefined),
    set: (nom: string, valeur: string) => bocal.set(nom, valeur),
  }),
  headers: async () => new Headers({ "x-real-ip": ip }),
}));

const { changerMotDePasse, commencerSecondCode, enregistrerSecondCode, premiereOuverture, seConnecter } = await import("@/services/auth");

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
const MOT_DE_PASSE = "une phrase assez longue pour essayer";
const NOUVEAU = "une autre phrase pour essayer encore";
let p: Pool;
let n = 0;

describe.skipIf(!url)("première ouverture", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    process.env.SESSION_SECRET = "s".repeat(48);
    delete process.env.USINE_PASSWORD_HASH_B64;
    delete process.env.USINE_PREMIERE_OUVERTURE;
  });

  beforeEach(() => {
    ip = `198.51.100.${++n}`;
    bocal.clear();
  });

  afterAll(async () => {
    delete process.env.USINE_PREMIERE_OUVERTURE;
    await p?.end();
  });

  it("est refusée sans hachage et sans la variable", async () => {
    expect(await premiereOuverture(MOT_DE_PASSE, MOT_DE_PASSE, true)).toEqual({ ok: false, message: "L'Usine n'est pas encore ouverte." });
    process.env.USINE_PREMIERE_OUVERTURE = "Oui";
    expect((await premiereOuverture(MOT_DE_PASSE, MOT_DE_PASSE, true)).ok).toBe(false);
    expect((await p.query("SELECT 1 FROM reglage WHERE cle = $1", [CLE_HACHAGE])).rowCount).toBe(0);
  });

  it("refuse un mot de passe trop court", async () => {
    process.env.USINE_PREMIERE_OUVERTURE = "oui";
    expect(await premiereOuverture("onze-signes", "onze-signes", true)).toEqual({ ok: false, message: "Choisissez 12 caractères au moins." });
    expect((await p.query("SELECT 1 FROM reglage WHERE cle = $1", [CLE_HACHAGE])).rowCount).toBe(0);
  });

  it("est acceptée une seule fois avec la variable, puis refusée", async () => {
    process.env.USINE_PREMIERE_OUVERTURE = "oui";
    expect(await premiereOuverture(MOT_DE_PASSE, MOT_DE_PASSE, true)).toEqual({ ok: true });
    expect(await verifierJeton(bocal.get(NOM_COOKIE_SESSION))).not.toBeNull();
    expect((await premiereOuverture(NOUVEAU, NOUVEAU, true)).ok).toBe(false);
  });

  it("ouvre ensuite la connexion avec ce mot de passe, et la refuse avec un mauvais", async () => {
    expect(await seConnecter("un mauvais mot de passe", false)).toEqual({ ok: false, message: "Mot de passe incorrect." });
    expect(bocal.has(NOM_COOKIE_SESSION)).toBe(false);
    expect(await seConnecter(MOT_DE_PASSE, false)).toEqual({ ok: true });
    expect(await verifierJeton(bocal.get(NOM_COOKIE_SESSION))).not.toBeNull();
  });

  it("rend l'ancien jeton caduc après un changement de mot de passe", async () => {
    await seConnecter(MOT_DE_PASSE, true);
    const debut = await commencerSecondCode();
    if (!debut.ok) throw new Error(debut.message);
    expect((await enregistrerSecondCode(codeAuPas(debut.secret, pasDe(Date.now())))).ok).toBe(true);
    const ancien = bocal.get(NOM_COOKIE_SESSION);
    expect(await verifierJeton(ancien)).not.toBeNull();
    expect(await changerMotDePasse(MOT_DE_PASSE, NOUVEAU, NOUVEAU)).toEqual({ ok: true });
    expect(await verifierJeton(ancien)).toBeNull();
    expect(await verifierJeton(bocal.get(NOM_COOKIE_SESSION))).not.toBeNull();
    expect((await seConnecter(MOT_DE_PASSE, false)).ok).toBe(false);
    expect((await seConnecter(NOUVEAU, false)).ok).toBe(true);
  });

  it("n'écrit rien du mot de passe ni du hachage dans le journal", async () => {
    const { rows } = await p.query<{ valeur: string }>("SELECT valeur FROM reglage WHERE cle = $1", [CLE_HACHAGE]);
    const hachageB64 = rows[0].valeur;
    const hachage = Buffer.from(hachageB64, "base64").toString("utf8");
    const journal = JSON.stringify((await p.query("SELECT * FROM journal WHERE sujet = 'connexion'")).rows);
    expect(journal).toContain("Première ouverture");
    for (const secret of [MOT_DE_PASSE, NOUVEAU, hachageB64, hachage, "$argon2id$"]) expect(journal).not.toContain(secret);
  });
});
