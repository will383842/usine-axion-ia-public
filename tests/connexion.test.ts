/**
 * T01 · Connexion : mauvais mot de passe refusé, jeton expiré refusé, adresse protégée refusée sans session.
 * L0-04 · Adresse forgée sans effet sur la clé de limite ; appareil connu compté à part (un tiers ne le verrouille
 * pas) ; essais simultanés comptés avant d'être faits ; plage illisible : échec fermé.
 */
import { hash } from "@node-rs/argon2";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NOM_COOKIE_APPAREIL, NOM_COOKIE_SESSION, signerAppareil, signerJeton, verifierAppareil, verifierJeton } from "@/lib/jeton-session";
import { adresseDepuisEntetes, ECHECS_MAX, ECHECS_MAX_TOUTES_ADRESSES, LimiteEssais, REGLAGES_ARGON2, verifierMotDePasse } from "@/lib/mot-de-passe";
import { cleAdresse, dansPlage, PLAGES_CLOUDFLARE_V4, PLAGES_CLOUDFLARE_V6 } from "@/lib/plages-cloudflare";
import { proxy } from "@/proxy";

// Les services lisent cookies() et headers() : un bocal de cookies et des en-têtes par essai.
const bocal = new Map<string, string>();
let entetes: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (bocal.has(nom) ? { name: nom, value: bocal.get(nom) } : undefined),
    set: (nom: string, valeur: string) => bocal.set(nom, valeur),
  }),
  headers: async () => new Headers(entetes),
}));
// Compte les vérifications argon2 réellement faites.
const verifications = vi.hoisted(() => ({ n: 0 }));
vi.mock("@node-rs/argon2", async (original) => {
  const vrai = await original<typeof import("@node-rs/argon2")>();
  return { ...vrai, verify: (...a: Parameters<typeof vrai.verify>) => (verifications.n++, vrai.verify(...a)) };
});
const { seConnecter } = await import("@/services/auth");

const MOT_DE_PASSE = "un-mot-de-passe-d-essai";
let hashB64: string;

beforeAll(async () => {
  hashB64 = Buffer.from(await hash(MOT_DE_PASSE, REGLAGES_ARGON2)).toString("base64");
  process.env.SESSION_SECRET = "s".repeat(48);
  process.env.USINE_PASSWORD_HASH_B64 = hashB64;
});

describe("mot de passe", () => {
  it("accepte le bon mot de passe", async () => {
    expect(await verifierMotDePasse(MOT_DE_PASSE, hashB64)).toBe(true);
  });

  it("refuse un mauvais mot de passe", async () => {
    expect(await verifierMotDePasse("mauvais-mot-de-passe", hashB64)).toBe(false);
    expect(await verifierMotDePasse("", hashB64)).toBe(false);
  });

  it("refuse tout quand le hachage manque ou n'est pas un argon2id", async () => {
    expect(await verifierMotDePasse(MOT_DE_PASSE, undefined)).toBe(false);
    expect(await verifierMotDePasse(MOT_DE_PASSE, Buffer.from("pas-un-hachage").toString("base64"))).toBe(false);
  });

  it("bloque une adresse après 5 échecs en 15 minutes", () => {
    const limite = new LimiteEssais();
    const t = Date.now();
    for (let i = 0; i < ECHECS_MAX; i++) limite.noterEchec("192.0.2.1", t);
    expect(limite.bloque("192.0.2.1", t)).toBe(true);
    expect(limite.bloque("192.0.2.2", t)).toBe(false);
    expect(limite.bloque("192.0.2.1", t + 15 * 60 * 1000 + 1)).toBe(false);
  });

  it("retient l'adresse réelle d'une requête venue de Cloudflare", () => {
    const h = (e: Record<string, string>) => new Headers(e);
    expect(adresseDepuisEntetes(h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9, 162.158.0.1", "x-real-ip": "162.158.0.1" }))).toBe("198.51.100.7");
    expect(adresseDepuisEntetes(h({ "x-forwarded-for": "10.0.0.1, 203.0.113.9, 2606:4700::1", "x-real-ip": "2606:4700::1" }))).toBe("203.0.113.9");
    expect(adresseDepuisEntetes(h({}))).toBe("local");
  });

  it("ignore un faux cf-connecting-ip sur une requête directe", () => {
    const h = (e: Record<string, string>) => new Headers(e);
    expect(adresseDepuisEntetes(h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(adresseDepuisEntetes(h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "198.51.100.7, 192.0.2.66" }))).toBe("192.0.2.66");
  });

  it("un attaquant qui change d'adresse à chaque essai ne contourne pas la limite globale", () => {
    const limite = new LimiteEssais();
    const t = Date.now();
    for (let i = 0; i < ECHECS_MAX_TOUTES_ADRESSES; i++) {
      expect(limite.bloque(`198.51.100.${i}`, t + i)).toBe(false);
      limite.noterEchec(`198.51.100.${i}`, t + i);
    }
    expect(limite.bloque("203.0.113.200", t + 100)).toBe(true);
    // Ralentit sans bloquer pour de bon : 15 minutes après le premier échec, un essai se libère.
    expect(limite.bloque("203.0.113.200", t + 15 * 60 * 1000 + 1)).toBe(false);
  });

  it("un x-forwarded-for forgé hors plage Cloudflare ne change pas la clé de limite", () => {
    // Requête directe : Traefik ajoute en dernier l'adresse qui s'est connectée (203.0.113.9) ; le reste est forgé.
    const forges = ["", "198.51.100.7, ", "104.16.0.1, ", "2606:4700::1, 104.16.0.1, ", "n'importe quoi, "];
    const limite = new LimiteEssais();
    const t = Date.now();
    for (const [i, debut] of forges.entries()) {
      const ip = adresseDepuisEntetes(new Headers({ "x-forwarded-for": `${debut}203.0.113.9`, "cf-connecting-ip": `198.51.100.${i}` }));
      expect(cleAdresse(ip)).toBe("203.0.113.9");
      limite.noterEchec(ip, t);
    }
    expect(limite.bloque("203.0.113.9", t)).toBe(true);
  });

  it("un appareil connu a sa propre limite : un tiers qui use l'adresse de Will ne le verrouille pas", () => {
    const limite = new LimiteEssais();
    const t = Date.now();
    for (let i = 0; i < ECHECS_MAX_TOUTES_ADRESSES; i++) limite.noterEchec("203.0.113.9", t);
    expect(limite.bloque("203.0.113.9", t)).toBe(true);
    expect(limite.bloque("203.0.113.9", t, "appareil-de-will")).toBe(false);
    // Un témoin volé ne donne pas d'essais illimités en changeant d'adresse.
    for (let i = 0; i < ECHECS_MAX; i++) limite.noterEchec(`198.51.100.${i}`, t, "appareil-vole");
    expect(limite.bloque("198.51.100.200", t, "appareil-vole")).toBe(true);
    expect(limite.bloque("198.51.100.200", t, "appareil-de-will")).toBe(false);
  });

  it("des essais simultanés sont comptés avant d'être faits", async () => {
    entetes = { "x-forwarded-for": "203.0.113.50" };
    bocal.clear();
    verifications.n = 0;
    const r = await Promise.all(Array.from({ length: 12 }, () => seConnecter("mauvais-mot-de-passe", false)));
    expect(verifications.n).toBe(ECHECS_MAX);
    expect(r.every((x) => !x.ok)).toBe(true);
  });

  it("Will se connecte depuis son appareil connu même quand un tiers a usé son adresse", async () => {
    entetes = { "x-forwarded-for": "198.51.100.77, 203.0.113.60" };
    bocal.clear();
    for (let i = 0; i < ECHECS_MAX + 2; i++) await seConnecter("mauvais-mot-de-passe", false);
    expect(await seConnecter(MOT_DE_PASSE, false)).toEqual({ ok: false, message: "Trop d'essais. Réessayez dans 15 minutes." });
    bocal.set(NOM_COOKIE_APPAREIL, await signerAppareil());
    expect(await seConnecter(MOT_DE_PASSE, false)).toEqual({ ok: true });
  }, 20_000);

  it("un témoin d'appareil émis avant un changement de mot de passe ne vaut plus", async () => {
    const temoin = await signerAppareil();
    expect(await verifierAppareil(temoin)).toEqual(expect.any(String));
    process.env.USINE_PASSWORD_HASH_B64 = Buffer.from(await hash("un-autre-mot-de-passe", REGLAGES_ARGON2)).toString("base64");
    try {
      expect(await verifierAppareil(temoin)).toBeNull();
    } finally {
      process.env.USINE_PASSWORD_HASH_B64 = hashB64;
    }
  });

  it("plages Cloudflare : toutes lisibles ; une plage illisible ne fait rien croire", () => {
    for (const p of [...PLAGES_CLOUDFLARE_V4, ...PLAGES_CLOUDFLARE_V6]) expect(dansPlage(p.split("/")[0], p)).toBe(true);
    for (const p of ["104.16.0.0/abc", "104.16.0.0/33", "104.16.0.0", "pas-une-adresse/13", "104.16.0.0/-1"]) {
      expect(dansPlage("104.16.0.1", p)).toBe(false);
    }
  });
});

describe("jeton de session", () => {
  it("accepte un jeton valide", async () => {
    const jeton = await signerJeton({ jti: "essai", rc: true }, 3600);
    expect(await verifierJeton(jeton)).toMatchObject({ jti: "essai", rc: true });
  });

  it("refuse un jeton expiré", async () => {
    const ilYADeuxHeures = Math.floor(Date.now() / 1000) - 7200;
    const jeton = await signerJeton({ jti: "essai", rc: false }, 3600, ilYADeuxHeures);
    expect(await verifierJeton(jeton)).toBeNull();
  });

  it("refuse un jeton mal signé ou modifié", async () => {
    const jeton = await signerJeton({ jti: "essai", rc: false }, 3600);
    const [entete, , signature] = jeton.split(".");
    const corps = Buffer.from(JSON.stringify({ jti: "autre", aud: "usine-axion-ia", exp: 9999999999 })).toString("base64url");
    expect(await verifierJeton(`${entete}.${corps}.${signature}`)).toBeNull();
    expect(await verifierJeton("n-importe-quoi")).toBeNull();
    expect(await verifierJeton(undefined)).toBeNull();
  });

  it("refuse un jeton émis avant un changement de mot de passe", async () => {
    const jeton = await signerJeton({ jti: "essai", rc: true }, 3600);
    process.env.USINE_PASSWORD_HASH_B64 = Buffer.from(await hash("un-autre-mot-de-passe", REGLAGES_ARGON2)).toString("base64");
    try {
      expect(await verifierJeton(jeton)).toBeNull();
    } finally {
      process.env.USINE_PASSWORD_HASH_B64 = hashB64;
    }
  });
});

describe("proxy", () => {
  const requete = (chemin: string, cookie?: string) =>
    new NextRequest(`https://usine.example.com${chemin}`, { headers: cookie ? { cookie: `${NOM_COOKIE_SESSION}=${cookie}` } : {} });

  it("renvoie vers /connexion une page protégée sans session", async () => {
    const r = await proxy(requete("/lots"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("https://usine.example.com/connexion?suite=%2Flots");
  });

  it("répond 401 à une route /api protégée sans session", async () => {
    expect((await proxy(requete("/api/autre"))).status).toBe(401);
  });

  it("refuse un jeton expiré", async () => {
    const expire = await signerJeton({ jti: "essai", rc: false }, 60, Math.floor(Date.now() / 1000) - 3600);
    expect((await proxy(requete("/lots", expire))).status).toBe(307);
  });

  it("laisse passer /connexion et /api/sante", async () => {
    for (const r of [await proxy(requete("/connexion")), await proxy(requete("/api/sante"))]) {
      expect(r.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("N-26 : un jeton valide sans second code vérifié n'ouvre pas une page protégée", async () => {
    const jeton = await signerJeton({ jti: "essai", rc: false }, 3600);
    expect((await proxy(requete("/lots", jeton))).status).toBe(307);
    expect((await proxy(requete("/api/autre", jeton))).status).toBe(401);
  });
});
