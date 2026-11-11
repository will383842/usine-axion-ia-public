/**
 * Récepteur des chiffres du CRM · interrupteur `agregats.recepteur` : livré ÉTEINT (migration additive 030), lu en base,
 * erreur de lecture = éteint ; avec lui éteint, la route répond 404 et n'écrit rien, même parfaitement signée.
 * Les essais exigent DATABASE_URL (PostgreSQL 16).
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
const SECRET = "secret-d-essai-des-agregats-0123456789";
let p: Pool;

function signee(methode: "GET" | "POST", corps: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const sha = createHash("sha256").update(corps).digest("hex");
  const signature = createHmac("sha256", SECRET).update([methode, "/api/agregats-crm", ts, nonce, sha].join("\n")).digest("hex");
  return { "x-axion-horodatage": ts, "x-axion-nonce": nonce, "x-axion-signature": signature, "x-forwarded-for": "203.0.113.7" };
}

afterEach(() => {
  delete process.env.USINE_AGREGATS_CRM_SECRET;
  delete process.env.USINE_AGREGATS_CRM_IPS;
});

describe.skipIf(!url)("agrégats du CRM · interrupteur", () => {
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

  it("livré éteint ; la migration est rejouable et n'écrase pas la valeur posée par Will", async () => {
    const { recepteurAllume, CODE_RECEPTEUR } = await import("@/agregats/interrupteur");
    expect(CODE_RECEPTEUR).toBe("agregats.recepteur");
    expect(await recepteurAllume()).toBe(false);
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'agregats.recepteur'");
    expect(await recepteurAllume()).toBe(true);
    const { readFileSync } = await import("node:fs");
    await p.query(readFileSync("migrations/030-interrupteur-agregats-recepteur.sql", "utf8"));
    expect(await recepteurAllume()).toBe(true);
    await p.query("UPDATE interrupteur SET allume = false WHERE code = 'agregats.recepteur'");
  });

  it("éteint : POST et GET signés répondent 404 et n'écrivent ni chiffre ni nonce", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    process.env.USINE_AGREGATS_CRM_IPS = "203.0.113.7";
    const { POST, GET } = await import("@/app/api/agregats-crm/route");
    const n = async (t: string) => (await p.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n as number;
    const [a, b] = [await n("agregat_crm"), await n("agregat_crm_nonce")];
    const jour = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const corps = JSON.stringify({ jour, genere_le: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), lignes: [{ jour, reseau: "facebook", compte: "page_principale", mot: "GUIDE", demandes: 10, guides: 8, accords: 5, mises_a_l_ecart: 3 }] });
    const r = await POST(new Request("http://localhost/api/agregats-crm", { method: "POST", headers: { "content-type": "application/json", ...signee("POST", corps) }, body: corps }));
    expect(r.status).toBe(404);
    expect((await GET(new Request("http://localhost/api/agregats-crm", { headers: signee("GET", "") }))).status).toBe(404);
    expect([await n("agregat_crm"), await n("agregat_crm_nonce")]).toEqual([a, b]);
  });

  it("lecture impossible (table absente) : éteint", async () => {
    const { utiliserPool } = await import("@/lib/base");
    const { recepteurAllume } = await import("@/agregats/interrupteur");
    const vide = new Pool({ connectionString: url, options: "-c search_path=pg_catalog" });
    try {
      utiliserPool(vide);
      expect(await recepteurAllume()).toBe(false);
    } finally {
      utiliserPool(p);
      await vide.end();
    }
  });
});
