/**
 * U-SECOND-CODE-ETEINT · l'interrupteur « connexion.second-code » commande l'exigence du second code (application).
 * - éteint (livré ainsi) : mot de passe seul, session complète, aucun écran de téléphone ni code de secours ;
 * - allumé : comportement de la 027 (session partielle, enregistrement imposé) ;
 * - la bascule passe par le chemin des autres interrupteurs, exige une session, et est journalisée ;
 * - lecture impossible : second code exigé ; base neuve, base migrée jusqu'à 026 puis jusqu'au bout, téléphone déjà enregistré intact.
 * Exige DATABASE_URL (sinon sautés).
 */
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { secondCodeExige } from "@/auth/exigence";
import { utiliserPool } from "@/lib/base";
import { NOM_COOKIE_SESSION, signerJeton, verifierJeton } from "@/lib/jeton-session";
import { dossierMigrations, jouerMigrations } from "@/lib/migrations";
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

const auth = await import("@/services/auth");
const { changerInterrupteur } = await import("@/app/reglages/interrupteurs/actions");

const url = process.env.DATABASE_URL;
const CODE = "connexion.second-code";
const MOT_DE_PASSE = "une phrase assez longue pour essayer";
const pools: Pool[] = [];
let p: Pool;
let n = 0;

async function baseNeuve(): Promise<Pool> {
  const schema = `essai_${randomBytes(4).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const q = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  pools.push(q);
  return q;
}
const ligne = async (q: Pool) => (await q.query(`SELECT * FROM interrupteur WHERE code = $1`, [CODE])).rows[0];
const requeteProxy = (chemin: string, jeton?: string) =>
  new NextRequest(`https://usine.example.com${chemin}`, { headers: jeton ? { cookie: `${NOM_COOKIE_SESSION}=${jeton}` } : {} });

describe.skipIf(!url)("second code : interrupteur", () => {
  beforeAll(async () => {
    p = await baseNeuve();
    utiliserPool(p);
    await jouerMigrations(p);
    process.env.SESSION_SECRET = "s".repeat(48);
    process.env.USINE_PASSWORD_HASH_B64 = Buffer.from(await hash(MOT_DE_PASSE, REGLAGES_ARGON2)).toString("base64");
  });
  beforeEach(() => {
    ip = `198.51.100.${++n}`;
    bocal.clear();
  });
  afterAll(async () => {
    delete process.env.USINE_PASSWORD_HASH_B64;
    await Promise.all(pools.map((q) => q.end()));
  });

  it("base neuve : l'interrupteur existe, éteint ; la 027 est jouée telle quelle", async () => {
    expect(await ligne(p)).toMatchObject({ allume: false, archive_le: null });
    expect((await p.query(`SELECT 1 FROM migration WHERE nom = '027-second-code.sql'`)).rowCount).toBe(1);
    expect(await secondCodeExige()).toBe(false);
  });

  it("éteint : le mot de passe seul ouvre une session complète, sans écran de téléphone ni code de secours", async () => {
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    const jeton = bocal.get(NOM_COOKIE_SESSION)!;
    const contenu = await verifierJeton(jeton);
    expect(contenu?.etape).toBeUndefined();
    expect(contenu?.sc).toBeUndefined();
    expect(await auth.etatConnexion()).toBe("connecte");
    await expect(auth.exigerSession()).resolves.toMatchObject({ rc: true });
    expect((await proxy(requeteProxy("/lots", jeton))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(requeteProxy("/api/autre", jeton))).headers.get("x-middleware-next")).toBe("1");
    // Aucun écran d'enregistrement, aucun code demandé : les étapes du second code sont refusées.
    expect((await auth.commencerSecondCode()).ok).toBe(false);
    expect((await auth.enregistrerSecondCode("123456")).ok).toBe(false);
    expect((await auth.entrerSecondCode("123456")).ok).toBe(false);
    expect((await auth.entrerCodeSecours("ABCD-EFGH")).ok).toBe(false);
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code`)).rows[0].n).toBe(0);
    // Les autres protections tiennent : sans cookie, ou jeton mal signé, rien ne passe.
    expect((await proxy(requeteProxy("/lots"))).status).toBe(307);
    expect((await proxy(requeteProxy("/lots", jeton.slice(0, -3) + "abc"))).status).toBe(307);
  });

  it("éteint : une mauvaise saisie reste refusée et la session partielle (étape mdp) n'ouvre rien", async () => {
    expect(await auth.seConnecter("mauvais mot de passe", true)).toMatchObject({ ok: false });
    expect(bocal.has(NOM_COOKIE_SESSION)).toBe(false);
    const partielle = await signerJeton({ jti: "p", rc: false, etape: "mdp" }, 600);
    expect((await proxy(requeteProxy("/lots", partielle))).status).toBe(307);
  });

  it("allumé : comportement actuel (session partielle, enregistrement imposé, rien d'ouvert)", async () => {
    await p.query(`UPDATE interrupteur SET allume = true WHERE code = $1`, [CODE]);
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    const jeton = bocal.get(NOM_COOKIE_SESSION)!;
    expect((await verifierJeton(jeton))?.etape).toBe("mdp");
    expect(await auth.etatConnexion()).toBe("enregistrer");
    expect((await proxy(requeteProxy("/lots", jeton))).status).toBe(307);
    await expect(auth.exigerSession()).rejects.toThrow();
    expect((await auth.commencerSecondCode()).ok).toBe(true);
    // Un jeton sans second code (mot de passe seul, session d'avant) ne vaut plus rien tant que c'est allumé.
    expect((await proxy(requeteProxy("/lots", await signerJeton({ jti: "a", rc: true }, 3600)))).status).toBe(307);
    await p.query(`UPDATE interrupteur SET allume = false WHERE code = $1`, [CODE]);
  });

  it("la bascule exige une session, passe par le chemin des interrupteurs et est journalisée", async () => {
    await expect(changerInterrupteur(CODE, true)).rejects.toThrow();
    expect((await ligne(p)).allume).toBe(false);
    expect(await auth.seConnecter(MOT_DE_PASSE, true)).toEqual({ ok: true });
    // Réserve R1 : l'allumage exige un téléphone enregistré.
    await p.query(`INSERT INTO second_code (secret_chiffre, confirme_le) VALUES ('x', now())`);
    await changerInterrupteur(CODE, true);
    expect((await ligne(p)).allume).toBe(true);
    const journal = (await p.query(`SELECT message, cible FROM journal WHERE sujet = 'interrupteur' AND cible = $1 ORDER BY id`, [CODE])).rows;
    expect(journal.length).toBeGreaterThanOrEqual(1);
    expect(journal[0]).toEqual({ message: "Second code à la connexion : allumé.", cible: CODE });
    // Allumé : la session sans second code tombe aussitôt.
    await expect(auth.exigerSession()).rejects.toThrow();
    await p.query(`UPDATE interrupteur SET allume = false WHERE code = $1`, [CODE]);
    await p.query(`UPDATE second_code SET archive_le = now() WHERE archive_le IS NULL`);
  });

  it("l'extinction est aussi journalisée", async () => {
    await p.query(`UPDATE interrupteur SET allume = true WHERE code = $1`, [CODE]);
    // Session complète portant un téléphone : fabriquée comme le fait la 027 (téléphone confirmé).
    const [{ id }] = (await p.query(`INSERT INTO second_code (secret_chiffre, confirme_le) VALUES ('x', now()) RETURNING id::text AS id`)).rows;
    bocal.set(NOM_COOKIE_SESSION, await signerJeton({ jti: "s", rc: true, sc: id }, 3600));
    await changerInterrupteur(CODE, false);
    expect((await ligne(p)).allume).toBe(false);
    const dernier = (await p.query(`SELECT message FROM journal WHERE cible = $1 ORDER BY id DESC LIMIT 1`, [CODE])).rows[0];
    expect(dernier.message).toBe("Second code à la connexion : éteint.");
    // Le téléphone déjà enregistré n'est jamais supprimé par la bascule.
    expect((await p.query(`SELECT count(*)::int AS n FROM second_code WHERE confirme_le IS NOT NULL AND archive_le IS NULL`)).rows[0].n).toBe(1);
  });

  it("lecture impossible (base sans la table) : le second code est exigé, jamais ouvert", async () => {
    const vide = await baseNeuve();
    utiliserPool(vide);
    try {
      expect(await secondCodeExige()).toBe(true);
      expect((await proxy(requeteProxy("/lots", await signerJeton({ jti: "z", rc: true }, 3600)))).status).toBe(307);
    } finally {
      utiliserPool(p);
    }
  });

  it("base migrée jusqu'à 026 puis jusqu'au bout : éteint ; migrée jusqu'à 040 avec un téléphone : intact", async () => {
    const racine = path.join(process.cwd(), "node_modules", ".cache");
    await mkdir(racine, { recursive: true });
    const jusqua = async (borne: string) => {
      const d = await mkdtemp(path.join(racine, "mig-sc-"));
      for (const nom of (await readdir(dossierMigrations())).filter((x) => x.slice(0, 3) <= borne)) await copyFile(path.join(dossierMigrations(), nom), path.join(d, nom));
      return d;
    };
    const a = await baseNeuve();
    await jouerMigrations(a, await jusqua("026"));
    expect((await a.query(`SELECT to_regclass('second_code') AS t`)).rows[0].t).toBeNull();
    await jouerMigrations(a);
    expect(await ligne(a)).toMatchObject({ allume: false });
    expect((await jouerMigrations(a)).jouees).toEqual([]);

    const b = await baseNeuve();
    await jouerMigrations(b, await jusqua("039"));
    expect(await ligne(b)).toBeUndefined();
    await b.query(`INSERT INTO second_code (secret_chiffre, confirme_le) VALUES ('secret-chiffre', now())`);
    const avant = (await b.query(`SELECT * FROM second_code`)).rows;
    expect((await jouerMigrations(b)).jouees).toContain("041-interrupteur-second-code.sql");
    expect(await ligne(b)).toMatchObject({ allume: false });
    expect((await b.query(`SELECT * FROM second_code`)).rows).toEqual(avant);
    // Rejouer la 041 ne réécrit pas un choix du fondateur.
    await b.query(`UPDATE interrupteur SET allume = true WHERE code = $1`, [CODE]);
    await b.query(await readFile(path.join(dossierMigrations(), "041-interrupteur-second-code.sql"), "utf8"));
    expect((await ligne(b)).allume).toBe(true);
  });
});
