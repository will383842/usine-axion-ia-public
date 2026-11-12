/**
 * U-ARRET · « Tout arrêter » : arrêté = zéro appel sortant et zéro commande (réponses automatiques comprises) ;
 * l'état se lit par la porte (secret exigé) ; la reprise n'a lieu que sur un geste noté au journal ; un redémarrage ne relance rien.
 * Faux fetch qui échoue s'il est appelé. Données fictives. Les essais exigent DATABASE_URL (PostgreSQL 16).
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { estPublic } from "@/proxy";

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
const SECRET = "secret-d-essai-de-la-porte-0123456789";
let p: Pool;

const get = (autorisation: string | null = `Bearer ${SECRET}`) =>
  new Request("http://localhost/api/porte/arret", { headers: autorisation === null ? {} : { authorization: autorisation } });

afterEach(() => {
  delete process.env.USINE_PORTE_SECRET;
});

describe("arrêt · proxy", () => {
  it("la route de la porte est ouverte au proxy (elle exige le secret elle-même), rien d'autre alentour", () => {
    expect(estPublic("/api/porte/arret")).toBe(true);
    for (const x of ["/api/porte/arret/x", "/api/porte/arrets", "/porte/arret"]) expect(estPublic(x)).toBe(false);
  });
});

describe.skipIf(!url)("arrêt · Tout arrêter", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
  });

  afterAll(async () => {
    await p?.end();
    const admin = new Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it("livré non arrêté ; la migration est additive et rejouable, elle n'écrase pas l'état posé", async () => {
    const { estArrete, CODE_ARRET } = await import("@/arret");
    expect(CODE_ARRET).toBe("arret.tout");
    expect(await estArrete()).toBe(false);
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'arret.tout'");
    const avant = (await p.query("SELECT count(*)::int AS n FROM interrupteur")).rows[0].n as number;
    await p.query(readFileSync("migrations/034-interrupteur-tout-arreter.sql", "utf8"));
    expect((await p.query("SELECT count(*)::int AS n FROM interrupteur")).rows[0].n).toBe(avant);
    expect(await estArrete()).toBe(true);
    await p.query("UPDATE interrupteur SET allume = false WHERE code = 'arret.tout'");
    expect(await estArrete()).toBe(false);
  });

  it("arrêté : l'appel sortant simulé n'est jamais appelé, ni pour une commande, ni pour une réponse automatique", async () => {
    const { arreter, reprendre, sousArret } = await import("@/arret");
    const faux = vi.fn(async () => {
      throw new Error("appel sortant interdit");
    });
    await arreter();
    for (const nature of ["commande", "reponse_automatique", "envoi"] as const) {
      const r = await sousArret(nature, () => faux());
      expect(r).toEqual({ fait: false, raison: "arrete" });
    }
    expect(faux).not.toHaveBeenCalled();
    await reprendre();
    const r = await sousArret("commande", async () => 7);
    expect(r).toEqual({ fait: true, valeur: 7 });
  });

  it("lecture impossible : vaut arrêté (rien ne part dans le doute)", async () => {
    const { utiliserPool } = await import("@/lib/base");
    const { estArrete, sousArret } = await import("@/arret");
    const vide = new Pool({ connectionString: url, options: `-c search_path=${schema}_absent` });
    utiliserPool(vide);
    expect(await estArrete()).toBe(true);
    const faux = vi.fn();
    expect((await sousArret("commande", faux)).fait).toBe(false);
    expect(faux).not.toHaveBeenCalled();
    await vide.end();
    utiliserPool(p);
  });

  it("arrêter et reprendre sont notés au journal ; rien n'est effacé", async () => {
    const { arreter, reprendre, estArrete } = await import("@/arret");
    const n = async (t: string) => (await p.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n as number;
    const [metiers, lots] = [await n("metier"), await n("lot")];
    const j0 = await n("journal");
    await arreter();
    await arreter(); // déjà arrêté : pas de seconde ligne
    expect(await n("journal")).toBe(j0 + 1);
    await reprendre();
    expect(await n("journal")).toBe(j0 + 2);
    const lignes = (await p.query("SELECT sujet, message FROM journal ORDER BY le DESC, id DESC LIMIT 2")).rows;
    expect(lignes.every((l) => l.sujet === "arret")).toBe(true);
    expect(await estArrete()).toBe(false);
    expect([await n("metier"), await n("lot")]).toEqual([metiers, lots]);
  });

  it("un redémarrage du serveur ne relance rien : l'état arrêté survit au rejeu des migrations", async () => {
    const { arreter, estArrete, reprendre } = await import("@/arret");
    const { jouerMigrations } = await import("@/lib/migrations");
    await arreter();
    await jouerMigrations(p);
    expect(await estArrete()).toBe(true);
    await reprendre();
  });

  it("l'interrupteur ordinaire ne peut pas reprendre : seul le bouton dédié le peut", async () => {
    const src = readFileSync("src/app/reglages/interrupteurs/actions.ts", "utf8");
    expect(src).toMatch(/CODE_ARRET/);
    expect(src).toMatch(/export async function toutArreter/);
    expect(src).toMatch(/export async function reprendreTout/);
  });

  it("porte : éteinte sans secret (404), 401 sans en-tête ou faux, sinon l'état sans aucune donnée de personne", async () => {
    const { GET } = await import("@/app/api/porte/arret/route");
    const { arreter, reprendre } = await import("@/arret");
    expect((await GET(get())).status).toBe(404);
    process.env.USINE_PORTE_SECRET = SECRET;
    expect((await GET(get(null))).status).toBe(401);
    expect((await GET(get("Bearer faux"))).status).toBe(401);
    const a = await GET(get());
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ arrete: false, depuis: null });
    await arreter();
    const b = await GET(get());
    const corps = (await b.json()) as { arrete: boolean; depuis: string };
    expect(corps.arrete).toBe(true);
    expect(Object.keys(corps).sort()).toEqual(["arrete", "depuis"]);
    expect(Number.isNaN(Date.parse(corps.depuis))).toBe(false);
    expect(b.headers.get("cache-control")).toBe("no-store");
    await reprendre();
  });
});
