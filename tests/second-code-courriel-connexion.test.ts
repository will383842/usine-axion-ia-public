/**
 * SCC-3 · Branchement du second code par courriel sur la connexion et écran d'essai (aucun réseau : la passerelle est un double).
 * - éteint : le mot de passe seul suffit ;
 * - essai raté : l'interrupteur reste éteint ; l'essai exige le mot de passe retapé ;
 * - essai réussi : l'interrupteur est allumé et la session en cours survit ;
 * - une autre session ouverte avant l'allumage est refusée (proxy et exigerSession) ; une session partielle ne passe pas ;
 * - une base illisible ne donne aucune session complète ;
 * - les deux interrupteurs allumés : le courriel l'emporte ;
 * - le bouton des interrupteurs et la mise en service ne s'allument pas l'un l'autre en même temps.
 * Exige DATABASE_URL (sinon sautés).
 */
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lireExigence, modeSecondCode } from "@/auth/exigence";
import { sessionComplete } from "@/auth/session";
import { utiliserPool } from "@/lib/base";
import { NOM_COOKIE_SESSION, verifierJeton } from "@/lib/jeton-session";
import { jouerMigrations } from "@/lib/migrations";
import { REGLAGES_ARGON2 } from "@/lib/mot-de-passe";
import { proxy } from "@/proxy";

const bocal = new Map<string, string>();
let ip = "198.51.100.1";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (bocal.has(nom) ? { name: nom, value: bocal.get(nom) } : undefined),
    set: (nom: string, valeur: string) => bocal.set(nom, valeur),
  }),
  headers: async () => new Headers({ "x-real-ip": ip }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const envois: string[] = [];
vi.mock("@/passerelles/courriel", () => ({
  courrielConfigure: () => true,
  envoyerCourriel: async (_d: string, _o: string, texte: string) => {
    envois.push(texte);
    return { envoye: true, statut: 202 };
  },
}));

const auth = await import("@/services/auth");
const { changerInterrupteur } = await import("@/app/reglages/interrupteurs/actions");

const url = process.env.DATABASE_URL;
const TOTP = "connexion.second-code";
const COURRIEL = "connexion.second-code-courriel";
const MOT_DE_PASSE = "une phrase assez longue pour essayer";
let p: Pool;
let n = 0;

const dernierCode = () => envois[envois.length - 1].match(/\b(\d{8})\b/)![1];
const requeteProxy = (jeton?: string) => new NextRequest("https://usine.example.com/lots", { headers: jeton ? { cookie: `${NOM_COOKIE_SESSION}=${jeton}` } : {} });
const allume = async (code: string) => (await p.query(`SELECT allume FROM interrupteur WHERE code = $1`, [code])).rows[0].allume as boolean;
const vieillir = () => p.query(`UPDATE second_code_courriel SET cree_le = cree_le - interval '2 days', expire_le = expire_le - interval '2 days'`);

/** Connexion par mot de passe (second code éteint), puis l'essai de mise en service complet. */
async function mettreEnService() {
  expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
  expect(await auth.envoyerCodeEssai(MOT_DE_PASSE)).toEqual({ ok: true });
  expect(await auth.validerCodeEssai(dernierCode())).toEqual({ ok: true });
}

describe.skipIf(!url)("second code par courriel : connexion et essai", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    const schema = `essai_${randomBytes(4).toString("hex")}`;
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    process.env.SESSION_SECRET = "s".repeat(48);
    process.env.USINE_COURRIEL_SECOND_CODE = "destinataire-essai@example.com";
    process.env.USINE_PASSWORD_HASH_B64 = Buffer.from(await hash(MOT_DE_PASSE, REGLAGES_ARGON2)).toString("base64");
  });
  beforeEach(async () => {
    ip = `198.51.100.${++n}`;
    bocal.clear();
    envois.length = 0;
    utiliserPool(p);
    await p.query(`UPDATE interrupteur SET allume = false WHERE code IN ($1, $2)`, [TOTP, COURRIEL]);
    await p.query(`UPDATE second_code_courriel_service SET archive_le = coalesce(archive_le, now())`);
    await p.query(`UPDATE second_code SET archive_le = coalesce(archive_le, now())`);
    await p.query(`UPDATE second_code_courriel SET archive_le = coalesce(archive_le, now())`);
    await vieillir();
    await p.query(`UPDATE second_code_essais SET echecs = 0, attente_jusqu_a = NULL, attentes_de_suite = 0 WHERE id = 1`);
  });
  afterAll(async () => {
    delete process.env.USINE_PASSWORD_HASH_B64;
    delete process.env.USINE_COURRIEL_SECOND_CODE;
    await p.end();
  });

  it("éteint : le mot de passe seul suffit, aucun code ne part", async () => {
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    expect(await auth.etatConnexion()).toBe("connecte");
    await expect(auth.exigerSession()).resolves.toMatchObject({ rc: true });
    expect(envois).toHaveLength(0);
    expect((await auth.entrerCodeCourriel("12345678")).ok).toBe(false);
  });

  it("essai raté : l'interrupteur reste éteint (mauvais code, puis mot de passe non retapé)", async () => {
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    // Mot de passe faux : aucun code ne part.
    expect(await auth.envoyerCodeEssai("un mauvais mot de passe")).toMatchObject({ ok: false });
    expect(envois).toHaveLength(0);
    expect(await auth.envoyerCodeEssai(MOT_DE_PASSE)).toEqual({ ok: true });
    expect(envois).toHaveLength(1);
    const faux = dernierCode() === "00000000" ? "11111111" : "00000000";
    expect(await auth.validerCodeEssai(faux)).toMatchObject({ ok: false });
    expect(await allume(COURRIEL)).toBe(false);
    await expect(auth.exigerSession()).resolves.toBeTruthy();
  });

  it("l'essai exige le mot de passe retapé : un cookie volé seul ne fait rien partir", async () => {
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    expect((await auth.envoyerCodeEssai("")).ok).toBe(false);
    expect(envois).toHaveLength(0);
    // Sans session : refusé avant tout (redirection).
    bocal.clear();
    await expect(auth.envoyerCodeEssai(MOT_DE_PASSE)).rejects.toThrow();
    expect(envois).toHaveLength(0);
  });

  it("essai réussi : interrupteur allumé, la session en cours survit (avec scm), journal avec phrases distinctes", async () => {
    await mettreEnService();
    expect(await allume(COURRIEL)).toBe(true);
    const jeton = bocal.get(NOM_COOKIE_SESSION)!;
    const e = await lireExigence();
    expect(e.mode).toBe("courriel");
    expect((await verifierJeton(jeton))?.scm).toBe(e.service);
    await expect(auth.exigerSession()).resolves.toMatchObject({ scm: e.service });
    expect((await proxy(requeteProxy(jeton))).headers.get("x-middleware-next")).toBe("1");
    const messages = (await p.query(`SELECT message FROM journal ORDER BY id`)).rows.map((r) => r.message);
    expect(messages).toContain("Code de mise en service envoyé.");
    expect(messages).toContain("Code de mise en service accepté.");
    expect(messages).not.toContain("Code de connexion accepté.");
  });

  it("une autre session ouverte avant l'allumage est refusée (proxy et exigerSession) ; la partielle ne passe pas ; le code de connexion ouvre", async () => {
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    const ancienne = bocal.get(NOM_COOKIE_SESSION)!;
    expect(await auth.envoyerCodeEssai(MOT_DE_PASSE)).toEqual({ ok: true });
    expect(await auth.validerCodeEssai(dernierCode())).toEqual({ ok: true });
    // L'ancienne session (sans scm) tombe.
    expect((await proxy(requeteProxy(ancienne))).status).toBe(307);
    bocal.set(NOM_COOKIE_SESSION, ancienne);
    await expect(auth.exigerSession()).rejects.toThrow();
    // Nouvelle connexion : session partielle, un code part, rien ne s'ouvre avant lui.
    await vieillir();
    bocal.clear();
    ip = `198.51.100.${++n}`;
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    const partielle = bocal.get(NOM_COOKIE_SESSION)!;
    expect((await verifierJeton(partielle))?.etape).toBe("mdp");
    expect(await auth.etatConnexion()).toBe("code-courriel");
    expect(envois).toHaveLength(2); // essai + connexion
    expect((await proxy(requeteProxy(partielle))).status).toBe(307);
    await expect(auth.exigerSession()).rejects.toThrow();
    expect((await auth.entrerCodeCourriel("00000000")).ok).toBe(false);
    // Le bon code ouvre la session complète, avec scm.
    expect(await auth.renvoyerCodeCourriel()).toMatchObject({ ok: false }); // moins de 60 s : refusé
    expect(await auth.entrerCodeCourriel(dernierCode())).toEqual({ ok: true });
    await expect(auth.exigerSession()).resolves.toMatchObject({ scm: (await lireExigence()).service });
  });

  it("base illisible : aucune session complète (échec fermé)", async () => {
    await mettreEnService();
    const jeton = bocal.get(NOM_COOKIE_SESSION)!;
    expect(await sessionComplete(jeton)).not.toBeNull();
    const morte = new Pool({ connectionString: "postgres://x:y@127.0.0.1:1/z" });
    utiliserPool(morte);
    expect(await sessionComplete(jeton)).toBeNull();
    expect(await modeSecondCode()).not.toBe("aucun");
    expect((await proxy(requeteProxy(jeton))).status).toBe(307);
    utiliserPool(p);
    await morte.end().catch(() => undefined);
  });

  it("les deux interrupteurs allumés : le courriel l'emporte ; sans mise en service, il n'est pas exigé (pas d'enfermement)", async () => {
    await mettreEnService();
    await p.query(`UPDATE interrupteur SET allume = true WHERE code = $1`, [TOTP]);
    expect((await lireExigence()).mode).toBe("courriel");
    const [{ id }] = (await p.query(`INSERT INTO second_code (secret_chiffre, confirme_le) VALUES ('x', now()) RETURNING id::text AS id`)).rows;
    const e = await lireExigence();
    const seulementTelephone = await (await import("@/lib/jeton-session")).signerJeton({ jti: "t", rc: true, sc: id }, 3600);
    expect(await sessionComplete(seulementTelephone)).toBeNull(); // un `sc` sans `scm` ne vaut rien en mode courriel
    expect(await sessionComplete(await (await import("@/lib/jeton-session")).signerJeton({ jti: "u", rc: true, scm: e.service }, 3600))).not.toBeNull();
    await p.query(`UPDATE second_code SET archive_le = now() WHERE archive_le IS NULL`);
    await p.query(`UPDATE interrupteur SET allume = false WHERE code = $1`, [TOTP]);
    // Interrupteur allumé mais aucune mise en service active (SQL direct) : le mot de passe seul vaut.
    await p.query(`UPDATE second_code_courriel_service SET archive_le = now() WHERE archive_le IS NULL`);
    expect((await lireExigence()).mode).toBe("aucun");
  });

  it("vérification et écriture atomiques : l'allumage de l'application et la mise en service simultanés ne laissent pas les deux allumés", async () => {
    await p.query(`INSERT INTO second_code (secret_chiffre, confirme_le) VALUES ('x', now())`);
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    expect(await auth.envoyerCodeEssai(MOT_DE_PASSE)).toEqual({ ok: true });
    const code = dernierCode();
    const [a, b] = await Promise.all([changerInterrupteur(TOTP, true), auth.validerCodeEssai(code).catch(() => ({ ok: false }))]); // si l'application passe d'abord, la session sans téléphone tombe (refus)
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1); // l'un des deux est refusé, pas les deux acceptés
    expect((await allume(TOTP)) && (await allume(COURRIEL))).toBe(false);
    await p.query(`UPDATE second_code SET archive_le = now() WHERE archive_le IS NULL`);
  });

  it("le refus d'allumer est RENDU en français simple (affiché par l'écran), jamais levé", async () => {
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    expect(await changerInterrupteur(TOTP, true)).toEqual({ ok: false, message: "Aucun téléphone n'est enregistré." });
    expect(await changerInterrupteur(COURRIEL, true)).toMatchObject({ ok: false, message: expect.stringContaining("Second code") });
    expect(await changerInterrupteur(COURRIEL, false)).toEqual({ ok: true }); // éteindre reste permis
  });
  it("une session seule (sans mot de passe ni code envoyé) ne consomme pas le compteur du compte et ne bloque pas la connexion", async () => {
    // Avant l'allumage : cinq faux codes sans aucun code en cours.
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    for (let i = 0; i < 6; i++) expect((await auth.validerCodeEssai("00000000")).ok).toBe(false);
    let e = (await p.query(`SELECT echecs, attente_jusqu_a, attentes_de_suite FROM second_code_essais WHERE id = 1`)).rows[0];
    expect(e).toMatchObject({ echecs: 0, attente_jusqu_a: null, attentes_de_suite: 0 });
    // Après l'allumage : même geste avec le cookie complet seul, puis le fondateur se connecte ailleurs.
    bocal.clear();
    await mettreEnService();
    for (let i = 0; i < 6; i++) expect((await auth.validerCodeEssai("00000000")).ok).toBe(false);
    e = (await p.query(`SELECT echecs, attente_jusqu_a, attentes_de_suite FROM second_code_essais WHERE id = 1`)).rows[0];
    expect(e).toMatchObject({ echecs: 0, attente_jusqu_a: null, attentes_de_suite: 0 });
    bocal.clear();
    await vieillir();
    ip = "203.0.113.77";
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toMatchObject({ ok: true });
    expect(await auth.entrerCodeCourriel(dernierCode())).toEqual({ ok: true });
  });
});
