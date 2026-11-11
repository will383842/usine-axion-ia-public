/**
 * Récepteur des chiffres agrégés du CRM Pro (contrat de la PR #418 du CRM : PUSH quotidien d'UN jour, GET des jours reçus).
 * Chaîne signée en 5 lignes `METHODE\nCHEMIN\nHORODATAGE\nNONCE\nSHA256(corps)`, HMAC-SHA256 hexadécimal, en-têtes
 * X-Axion-Horodatage / X-Axion-Nonce / X-Axion-Signature, nonce de 16 octets (32 hex), jours en UTC.
 * Route derrière l'interrupteur `agregats.recepteur` (éteint par défaut) ; filtre IP obligatoire (liste vide = refus).
 * Données fictives. Les essais de base exigent DATABASE_URL (PostgreSQL 16) ; l'interrupteur est simulé ici
 * (sa lecture réelle est dans tests/agregats-interrupteur.test.ts).
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { enRetardParCompte, jourDansFenetre, jourUtcDe, masquerLigne, schemaPush } from "@/agregats/regles";
import { signatureAttendue } from "@/agregats/signature";
import { PASSERELLES } from "../scripts/garde-sortante.mjs";
import { estPublic } from "@/proxy";

const etat = vi.hoisted(() => ({ allume: true, lectures: 0 }));
vi.mock("@/agregats/interrupteur", () => ({ CODE_RECEPTEUR: "agregats.recepteur", recepteurAllume: async () => { etat.lectures++; return etat.allume; } }));

const SECRET = "secret-d-essai-des-agregats-0123456789";
const AUTRE_SECRET = "un-autre-secret-de-plus-de-32-caracteres";
const CHEMIN = "/api/agregats-crm";
const IP = "203.0.113.7";
const routes = async () => import("@/app/api/agregats-crm/route");

function signer(methode: "GET" | "POST", corps: string, o: { secret?: string; ts?: number; nonce?: string; chemin?: string } = {}) {
  const ts = o.ts ?? Math.floor(Date.now() / 1000);
  const nonce = o.nonce ?? randomBytes(16).toString("hex");
  const sha = createHash("sha256").update(corps, "utf8").digest("hex");
  const canonique = [methode, o.chemin ?? CHEMIN, String(ts), nonce, sha].join("\n");
  const signature = createHmac("sha256", o.secret ?? SECRET).update(canonique).digest("hex");
  return { "x-axion-horodatage": String(ts), "x-axion-nonce": nonce, "x-axion-signature": signature };
}

type Opt = Parameters<typeof signer>[2];
const ENTETES_IP = { "x-forwarded-for": IP };

function envoi(donnees: unknown, o: Opt = {}, extra: Record<string, string> = {}) {
  const corps = typeof donnees === "string" ? donnees : JSON.stringify(donnees);
  return new Request(`http://localhost${CHEMIN}`, { method: "POST", headers: { "content-type": "application/json", ...ENTETES_IP, ...signer("POST", corps, o), ...extra }, body: corps });
}
function lecture(o: Opt = {}, extra: Record<string, string> = {}) {
  return new Request(`http://localhost${CHEMIN}`, { method: "GET", headers: { accept: "application/json", ...ENTETES_IP, ...signer("GET", "", o), ...extra } });
}

const utcDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const jourRelatif = (n: number) => utcDe(Date.now() + n * 86_400_000);
const ligne = (jour: string, mot = "GUIDE", compte = "page_principale", v: Partial<Record<"demandes" | "guides" | "accords" | "mises_a_l_ecart", number | "<3">> = {}) => ({
  jour, reseau: "facebook", compte, mot, demandes: 10, guides: 8, accords: 5, mises_a_l_ecart: 3, ...v,
});
/** Un push = UN jour ; les lignes portent le même jour. */
const push = (jour: string, lignes: unknown[] = [ligne(jour)], genere_le = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) => ({ jour, genere_le, lignes });

beforeEach(() => {
  etat.allume = true;
  etat.lectures = 0;
  process.env.USINE_AGREGATS_CRM_IPS = IP;
});
afterEach(() => {
  delete process.env.USINE_AGREGATS_CRM_SECRET;
  delete process.env.USINE_AGREGATS_CRM_IPS;
  vi.restoreAllMocks();
});

describe("agrégats du CRM · sans base", () => {
  it("le proxy laisse passer ce seul chemin", () => {
    expect(estPublic("/api/agregats-crm")).toBe(true);
    expect(estPublic("/api/agregats-crm/")).toBe(true);
    for (const p of ["/api/agregats-crm/x", "/api/agregats-crmx", "/api/agregats", "/agregats-crm"]) expect(estPublic(p)).toBe(false);
  });

  it("vecteur de signature fixe : chaîne en 5 lignes, HMAC-SHA256 hexadécimal minuscule, GET sur corps vide", () => {
    const corps = '{"jour":"2026-11-03","genere_le":"2026-11-04T05:30:00Z","lignes":[]}';
    const e = { horodatage: 1793770200, nonce: "00112233445566778899aabbccddeeff" };
    expect(signatureAttendue(SECRET, "POST", CHEMIN, e, corps)).toBe("eb7c85c3f4ba5057e64a73f0b0016e69408b598354229b0952ff6c80f7fc3151");
    expect(signatureAttendue(SECRET, "GET", CHEMIN, e, "")).toBe("e349a438a754a47bfab948156c0565167da0d027f241b6dc44193d7526c51c75");
  });

  it("interrupteur éteint : 404 pour POST et GET, même parfaitement signés", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    etat.allume = false;
    const { POST, GET } = await routes();
    expect((await POST(envoi(push(jourRelatif(-1))))).status).toBe(404);
    expect((await GET(lecture())).status).toBe(404);
  });

  it("secret absent ou de moins de 32 caractères : 404 (POST et GET), même signé avec lui", async () => {
    const { POST, GET } = await routes();
    for (const secret of [undefined, "", "court", "x".repeat(31)]) {
      if (secret === undefined) delete process.env.USINE_AGREGATS_CRM_SECRET;
      else process.env.USINE_AGREGATS_CRM_SECRET = secret;
      expect((await POST(envoi(push(jourRelatif(-1)), { secret: secret ?? "inconnu" }))).status).toBe(404);
      expect((await GET(lecture({ secret: secret ?? "inconnu" }))).status).toBe(404);
    }
  });

  it("sans signature valide : 401 (POST et GET), le secret n'est jamais répété", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST, GET } = await routes();
    const corps = JSON.stringify(push(jourRelatif(-1)));
    const bon = signer("POST", corps);
    const cas: Record<string, string>[] = [
      {},
      { ...bon, "x-axion-signature": "0".repeat(64) },
      { ...bon, "x-axion-signature": "zz" },
      { ...bon, "x-axion-nonce": "a".repeat(16) },
      { "x-crm-horodatage": bon["x-axion-horodatage"], "x-crm-nonce": bon["x-axion-nonce"], "x-crm-signature": bon["x-axion-signature"] },
      signer("POST", corps, { secret: AUTRE_SECRET }),
      signer("POST", corps, { chemin: "/api/autre" }),
      signer("GET", corps),
      signer("POST", `${corps} `),
    ];
    for (const entetes of cas) {
      const r = await POST(new Request(`http://localhost${CHEMIN}`, { method: "POST", headers: { "content-type": "application/json", ...ENTETES_IP, ...entetes }, body: corps }));
      expect(r.status, JSON.stringify(entetes)).toBe(401);
      expect(JSON.stringify(await r.json())).not.toContain(SECRET);
    }
    expect((await GET(lecture({ secret: AUTRE_SECRET }))).status).toBe(401);
    expect((await GET(new Request(`http://localhost${CHEMIN}`, { method: "GET", headers: ENTETES_IP }))).status).toBe(401);
    // une signature de POST ne vaut pas pour un GET
    expect((await GET(new Request(`http://localhost${CHEMIN}`, { method: "GET", headers: { ...ENTETES_IP, ...signer("POST", "") } }))).status).toBe(401);
  });

  it("la comparaison de signature se fait en temps constant (timingSafeEqual), jamais par ===", () => {
    const src = readFileSync("src/agregats/signature.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).not.toMatch(/signature\s*[!=]==/);
  });

  it("horodatage hors de ±5 min : 401 (POST et GET)", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST, GET } = await routes();
    const maintenant = Math.floor(Date.now() / 1000);
    for (const ts of [maintenant - 301, maintenant + 301, maintenant - 86_400]) {
      expect((await POST(envoi(push(jourRelatif(-1)), { ts }))).status).toBe(401);
      expect((await GET(lecture({ ts }))).status).toBe(401);
    }
  });

  it("filtre IP : liste vide = REFUS 403 (échec fermé), même signé ; hors liste = 403 ; dans la liste = on continue", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST, GET } = await routes();
    delete process.env.USINE_AGREGATS_CRM_IPS;
    expect((await POST(envoi(push(jourRelatif(-1))))).status).toBe(403);
    expect((await GET(lecture())).status).toBe(403);
    process.env.USINE_AGREGATS_CRM_IPS = " , ";
    expect((await POST(envoi(push(jourRelatif(-1))))).status).toBe(403);
    process.env.USINE_AGREGATS_CRM_IPS = "203.0.113.7, 203.0.113.8";
    expect((await POST(envoi(push(jourRelatif(-1)), {}, { "x-forwarded-for": "198.51.100.9" }))).status).toBe(403);
    expect((await GET(lecture({}, { "x-forwarded-for": "198.51.100.9" }))).status).toBe(403);
    // dans la liste, signature fausse : 401 (et non 403) prouve que le filtre a laissé passer ; aucune base touchée
    expect((await POST(envoi(push(jourRelatif(-1)), { secret: AUTRE_SECRET }, { "x-forwarded-for": "203.0.113.8" }))).status).toBe(401);
  });

  it("filtre IP AVANT l'interrupteur : un inconnu (liste vide ou hors liste) reçoit 403 sans aucune lecture en base ; l'IP permise, interrupteur éteint, reçoit 404", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST, GET } = await routes();
    etat.allume = false;
    expect((await POST(envoi(push(jourRelatif(-1)), {}, { "x-forwarded-for": "198.51.100.9" }))).status).toBe(403);
    expect((await GET(lecture({}, { "x-forwarded-for": "198.51.100.9" }))).status).toBe(403);
    delete process.env.USINE_AGREGATS_CRM_IPS;
    expect((await POST(envoi(push(jourRelatif(-1))))).status).toBe(403);
    expect(etat.lectures).toBe(0);
    process.env.USINE_AGREGATS_CRM_IPS = IP;
    expect((await POST(envoi(push(jourRelatif(-1))))).status).toBe(404);
    expect((await GET(lecture())).status).toBe(404);
    expect(etat.lectures).toBe(2);
  });

  it("filtre IP : cf-connecting-ip n'est cru que derrière Cloudflare", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const mauvaise = { secret: AUTRE_SECRET };
    const cf = await POST(envoi(push(jourRelatif(-1)), mauvaise, { "x-forwarded-for": "198.51.100.9, 173.245.48.1", "cf-connecting-ip": IP }));
    expect(cf.status).toBe(401);
    const hors = await POST(envoi(push(jourRelatif(-1)), mauvaise, { "x-forwarded-for": "198.51.100.9, 173.245.48.1", "cf-connecting-ip": "198.51.100.9" }));
    expect(hors.status).toBe(403);
    const forge = await POST(envoi(push(jourRelatif(-1)), mauvaise, { "x-forwarded-for": "198.51.100.9", "cf-connecting-ip": IP }));
    expect(forge.status).toBe(403);
  });

  it("sans en-têtes signés valides : 401 AVANT 415 et 413 ; avec en-têtes bien formés, 415/413 restent possibles", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const texte = new Request(`http://localhost${CHEMIN}`, { method: "POST", headers: { "content-type": "text/plain", ...ENTETES_IP }, body: "x" });
    expect((await POST(texte)).status).toBe(401);
    const gros = new Request(`http://localhost${CHEMIN}`, { method: "POST", headers: { "content-type": "application/json", "content-length": String(10 * 1024 * 1024), ...ENTETES_IP }, body: "{}" });
    expect((await POST(gros)).status).toBe(401);
    const vieux = Math.floor(Date.now() / 1000) - 3600;
    const perime = new Request(`http://localhost${CHEMIN}`, { method: "POST", headers: { "content-type": "text/plain", ...ENTETES_IP, ...signer("POST", "x", { ts: vieux }) }, body: "x" });
    expect((await POST(perime)).status).toBe(401);
  });

  it("jours en UTC : jourUtcDe et fenêtre [aujourd'hui − 7 ; veille]", () => {
    expect(jourUtcDe(Date.parse("2026-11-04T23:30:00Z"))).toBe("2026-11-04");
    expect(jourUtcDe(Date.parse("2026-11-04T00:30:00+01:00"))).toBe("2026-11-03");
    const auj = "2026-11-02";
    for (const j of ["2026-10-26", "2026-10-27", "2026-11-01"]) expect(jourDansFenetre(j, auj), j).toBe(true);
    for (const j of ["2026-10-25", "2026-11-02", "2026-11-03", "2000-01-01"]) expect(jourDansFenetre(j, auj), j).toBe(false);
  });

  it("bandeau de retard par compte : le compte le plus en retard le déclenche", () => {
    const auj = "2026-11-02";
    expect(enRetardParCompte([], auj)).toBe(true);
    expect(enRetardParCompte(["2026-11-01", "2026-11-01"], auj)).toBe(false);
    expect(enRetardParCompte(["2026-11-01", "2026-10-30"], auj)).toBe(true);
  });

  it("schéma du contrat : un jour, des lignes à clés fermées ; une liste de lignes vide est permise (tout masqué)", () => {
    const j = "2026-11-01";
    expect(schemaPush.safeParse(push(j)).success).toBe(true);
    expect(schemaPush.safeParse(push(j, [])).success).toBe(true);
    expect(schemaPush.safeParse(push(j, [ligne(j, "AA", "page_x", { accords: "<3" })])).success).toBe(true);
  });

  it("schéma strict : donnée de personne, clé inconnue, ancienne clé, jours qui diffèrent, nombre <3 en clair, doublon : refusés", () => {
    const j = "2026-11-01";
    const refus: unknown[] = [
      { ...push(j), extra: 1 },
      { jour: j, lignes: [ligne(j)] },
      { ...push(j), jour: "2026-11-02" },
      { ...push(j), jour: undefined },
      push(j, [{ ...ligne(j), email: "x@example.com" }]),
      push(j, [{ ...ligne(j), nom: "Une personne" }]),
      push(j, [{ ...ligne(j), post_ref: "p1" }]),
      push(j, [{ ...ligne(j), commentaire_ref: "c1" }]),
      push(j, [{ ...ligne(j), pseudo: "x" }]),
      push(j, [{ ...ligne(j), guides_envoyes: 8 }]),
      push(j, [ligne("2026-10-31")]),
      push("2026-02-30", [ligne("2026-02-30")]),
      push(j, [ligne(j, "GUIDE", "page_principale", { demandes: 0 })]),
      push(j, [ligne(j, "GUIDE", "page_principale", { demandes: 1 })]),
      push(j, [ligne(j, "GUIDE", "page_principale", { accords: 2 })]),
      push(j, [ligne(j, "GUIDE", "page_principale", { demandes: -1 })]),
      push(j, [ligne(j, "GUIDE", "page_principale", { demandes: 1.5 })]),
      push(j, [ligne(j, "GUIDE", "page_principale", { demandes: "<4" as never })]),
      push(j, [ligne(j, "GUIDE", "page_principale", { demandes: "12" as never })]),
      push(j, [ligne(j, "mot avec espaces")]),
      push(j, [ligne(j, "GUIDE", "Page Principale")]),
      push(j, [ligne(j), ligne(j)]),
      push(j, [ligne(j, "AA", "page_x"), ligne(j, "AA", "page_x", { demandes: 4 })]),
      push(j, [ligne(j, "AA", "page_x"), { ...ligne(j, "BB", "page_x"), reseau: "instagram" }, { ...ligne(j, "BB", "page_x"), reseau: "instagram" }]),
      push(j, Array.from({ length: 501 }, (_, i) => ligne(j, `M${i}`))),
      push(j, [ligne(j)], "hier"),
    ];
    for (const c of refus) expect(schemaPush.safeParse(c).success, JSON.stringify(c).slice(0, 90)).toBe(false);
    // le même compte peut figurer sur deux réseaux (unicité sur réseau, compte, mot) ; un autre compte, un autre réseau : permis
    expect(schemaPush.safeParse(push(j, [ligne(j, "AA", "page_x"), { ...ligne(j, "BB", "page_y"), reseau: "instagram" }])).success).toBe(true);
    expect(schemaPush.safeParse(push(j, [ligne(j, "AA", "page_x"), { ...ligne(j, "AA", "page_x"), reseau: "instagram" }])).success).toBe(true);
  });

  it("corps : trop grand = 413 (content-length ou flux), mauvais type = 415", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const gros = new Request(`http://localhost${CHEMIN}`, { method: "POST", headers: { "content-type": "application/json", "content-length": String(10 * 1024 * 1024), ...ENTETES_IP, ...signer("POST", "{}") }, body: "{}" });
    expect((await POST(gros)).status).toBe(413);
    let envoyes = 0;
    const flux = new ReadableStream<Uint8Array>({
      pull(c) {
        envoyes += 1024;
        c.enqueue(new Uint8Array(1024).fill(120));
        if (envoyes >= 4 * 1024 * 1024) c.close();
      },
    });
    const enflux = new Request(`http://localhost${CHEMIN}`, { method: "POST", headers: { "content-type": "application/json", ...ENTETES_IP, ...signer("POST", "{}") }, body: flux, duplex: "half" } as RequestInit);
    expect((await POST(enflux)).status).toBe(413);
    expect(envoyes).toBeLessThan(1024 * 1024);
    const texte = new Request(`http://localhost${CHEMIN}`, { method: "POST", headers: { "content-type": "text/plain", ...ENTETES_IP, ...signer("POST", "x") }, body: "x" });
    expect((await POST(texte)).status).toBe(415);
  });

  it("masquage double : toute cellule <3 est masquée, et une 2e cellule avec elle", () => {
    expect(masquerLigne({ demandes: 10, guides: 8, accords: 5, mises_a_l_ecart: 4 })).toEqual({ demandes: 10, guides: 8, accords: 5, mises_a_l_ecart: 4 });
    expect(masquerLigne({ demandes: 10, guides: 8, accords: 5, mises_a_l_ecart: "<3" })).toEqual({ demandes: 10, guides: 8, accords: null, mises_a_l_ecart: null });
    expect(masquerLigne({ demandes: 10, guides: "<3", accords: 5, mises_a_l_ecart: "<3" })).toEqual({ demandes: 10, guides: null, accords: 5, mises_a_l_ecart: null });
  });

  it("le journal ne contient jamais le secret, la signature ni le corps", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const sorties: string[] = [];
    for (const m of ["info", "error", "warn", "log"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void sorties.push(a.map(String).join(" ")));
    const { POST, GET } = await routes();
    const corps = push(jourRelatif(-1), [{ ...ligne(jourRelatif(-1)), email: "une.personne@example.com" }]);
    const requete = envoi(corps);
    const signature = requete.headers.get("x-axion-signature")!;
    await POST(requete);
    await POST(envoi(corps, { secret: AUTRE_SECRET }));
    await GET(lecture());
    const tout = sorties.join("\n");
    for (const interdit of [SECRET, AUTRE_SECRET, signature, "une.personne"]) expect(tout).not.toContain(interdit);
  });

  it("PASSERELLES de la garde sortante inchangé ; aucune suppression ; le secret n'est lu que par son nom de variable", () => {
    expect(Object.keys(PASSERELLES).sort()).toEqual(["bases-source", "buffer", "site-lecture", "studio"]);
    expect(JSON.stringify(PASSERELLES)).not.toMatch(/crm/i);
    const fichiers = ["src/agregats", "src/app/api/agregats-crm"].flatMap((d) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => `${e.parentPath}/${e.name}`));
    fichiers.push("migrations/028-agregats-crm.sql", "migrations/030-interrupteur-agregats-recepteur.sql", "migrations/031-agregats-jours-recus.sql", "migrations/032-agregats-reseau-cle.sql");
    expect(fichiers.length).toBeGreaterThan(5);
    for (const f of fichiers) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/i);
      expect(src, f).not.toContain(SECRET);
    }
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;
const compter = async (sql = "SELECT count(*)::int AS n FROM agregat_crm") => (await p.query(sql)).rows[0].n as number;

describe.skipIf(!url)("agrégats du CRM · en base", () => {
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

  it("push entièrement masqué (aucune ligne écrite) : le jour est REÇU (joursRecus) ; un rejeu identique ne change rien", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST, GET } = await routes();
    const j = jourRelatif(-3);
    const jours = async () => ((await (await GET(lecture())).json()) as { jours: string[] }).jours;
    const lignesAvant = await compter();
    const vide = push(j, [], "2026-01-01T00:00:00Z");
    expect(await jours()).not.toContain(j);
    expect((await POST(envoi(vide))).status).toBe(200);
    expect(await jours()).toContain(j);
    const marques = await compter("SELECT count(*)::int AS n FROM agregat_crm_jour_recu");
    const apres = await jours();
    expect((await POST(envoi(vide))).status).toBe(200);
    expect(await jours()).toEqual(apres);
    expect(await compter("SELECT count(*)::int AS n FROM agregat_crm_jour_recu")).toBe(marques);
    expect(await compter()).toBe(lignesAvant);
  });

  it("accepte le push d'un jour, répond « reçu », masque les cellules <3, et le GET rend les jours reçus (7 dates strictes au plus)", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST, GET } = await routes();
    const jours = Array.from({ length: 7 }, (_, i) => jourRelatif(-(i + 1)));
    for (const j of jours) {
      const lignes = j === jours[0] ? [ligne(j), ligne(j, "CADEAU", "page_principale", { accords: "<3" })] : [ligne(j)];
      const r = await POST(envoi(push(j, lignes)));
      expect(r.status, j).toBe(200);
      expect(await r.json()).toEqual({ recu: true });
    }
    const g = await GET(lecture());
    expect(g.status).toBe(200);
    const corps = (await g.json()) as { jours: string[] };
    expect(Object.keys(corps)).toEqual(["jours"]);
    expect(corps.jours).toEqual([...jours].reverse());
    for (const j of corps.jours) expect(j).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const { lireAgregats } = await import("@/agregats");
    const lus = await lireAgregats(jours[6], jours[0]);
    const cadeau = lus.find((l) => l.mot === "CADEAU")!;
    expect(cadeau.accords).toBeNull();
    expect(cadeau.mises_a_l_ecart).toBeNull();
    expect(lus.find((l) => l.mot === "GUIDE")!.guides_envoyes).toBe(8);
  });

  it("le GET ne rend rien d'autre que des dates : aucun chiffre, aucun compte, aucun mot", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { GET } = await routes();
    const texte = await (await GET(lecture())).text();
    expect(texte).toMatch(/^\{"jours":\[("\d{4}-\d{2}-\d{2}"(,"\d{4}-\d{2}-\d{2}")*)?\]\}$/);
  });

  it("un jour sans ligne (tout masqué côté CRM) est reçu : 200 sans rien écrire", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const avant = await compter();
    expect((await POST(envoi(push(jourRelatif(-5), [])))).status).toBe(200);
    expect(await compter()).toBe(avant);
  });

  it("nonce rejoué : refusé (POST puis GET) ; le nonce reste noté, et un nonce vu il y a plus de 10 min (ou à la limite exacte, ou dans le futur) reste refusé", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST, GET } = await routes();
    const nonce = randomBytes(16).toString("hex");
    const corps = push(jourRelatif(-2), [ligne(jourRelatif(-2), "NONCE")]);
    expect((await POST(envoi(corps, { nonce }))).status).toBe(200);
    const avant = await compter("SELECT count(*)::int AS n FROM agregat_crm_nonce");
    expect((await POST(envoi(corps, { nonce }))).status).toBe(401);
    expect((await GET(lecture({ nonce }))).status).toBe(401);
    expect(await compter("SELECT count(*)::int AS n FROM agregat_crm_nonce")).toBeGreaterThanOrEqual(avant);
    for (const decalage of ["11 minutes", "10 minutes", "1 hour", "-1 hour"]) {
      await p.query(`UPDATE agregat_crm_nonce SET vu_le = now() - interval '${decalage}' WHERE nonce = $1`, [nonce]);
      expect((await POST(envoi(corps, { nonce }))).status, decalage).toBe(401);
      expect((await GET(lecture({ nonce }))).status, decalage).toBe(401);
    }
    expect(await compter("SELECT count(*)::int AS n FROM agregat_crm_nonce WHERE nonce = '" + nonce + "'")).toBe(1);
  });

  it("idempotence : même genere_le = 200 sans effet, plus ancien = 409, plus récent = lignes ajoutées et la plus récente gagne (rien n'est supprimé)", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const { lireAgregats } = await import("@/agregats");
    const jour = jourRelatif(-3);
    const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
    const t1 = Math.floor(Date.now() / 1000) * 1000 - 60_000;
    const t2 = t1 + 30_000;
    expect((await POST(envoi(push(jour, [ligne(jour, "UN", "compte_t", { demandes: 10 }), ligne(jour, "DEUX", "compte_t", { demandes: 20 })], iso(t2))))).status).toBe(200);
    const n1 = await compter();
    const ancien = await POST(envoi(push(jour, [ligne(jour, "UN", "compte_t", { demandes: 99 })], iso(t1))));
    expect(ancien.status).toBe(409);
    expect(await compter()).toBe(n1);
    const egal = await POST(envoi(push(jour, [ligne(jour, "UN", "compte_t", { demandes: 77 })], iso(t2))));
    expect(egal.status).toBe(200);
    expect(await compter()).toBe(n1);
    expect((await POST(envoi(push(jour, [ligne(jour, "UN", "compte_t", { demandes: 15 })], iso(t2 + 30_000))))).status).toBe(200);
    expect(await compter()).toBe(n1 + 1);
    const lus = (await lireAgregats(jour, jour)).filter((l) => l.compte === "compte_t");
    expect(lus.find((l) => l.mot === "UN")!.demandes).toBe(15);
    expect(lus.find((l) => l.mot === "DEUX")!.demandes).toBe(20);
    expect(lus).toHaveLength(2);
  });

  it("genere_le dans le futur : 400, rien d'écrit", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const avant = await compter();
    const futur = new Date(Date.now() + 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    expect((await POST(envoi(push(jourRelatif(-1), [ligne(jourRelatif(-1), "FUTUR")], futur)))).status).toBe(400);
    expect(await compter()).toBe(avant);
  });

  it("réseau inconnu : 400, rien d'écrit", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const j = jourRelatif(-1);
    const { POST } = await routes();
    expect((await POST(envoi(push(j, [{ ...ligne(j), reseau: "myspace" }])))).status).toBe(400);
    expect((await POST(envoi(push(j, [{ ...ligne(j), reseau: "" }])))).status).toBe(400);
    expect((await POST(envoi(push(j, [ligne(j)])))).status).toBe(200);
  });

  it("JSON illisible : 400", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    expect((await (await routes()).POST(envoi("pas du json"))).status).toBe(400);
  });

  it("un champ de personne ou un schéma faux est refusé en 400 sans rien écrire ni répéter la valeur", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const avant = await compter();
    const j = jourRelatif(-1);
    const r = await POST(envoi(push(j, [{ ...ligne(j), email: "une.personne@example.com" }])));
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toContain("une.personne");
    expect(await compter()).toBe(avant);
  });

  it("jour hors fenêtre UTC : 400, rien d'écrit", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const avant = await compter();
    for (const n of [0, 1, -8, -400]) {
      const j = jourRelatif(n);
      expect((await POST(envoi(push(j, [ligne(j, "HORS")])))).status, String(n)).toBe(400);
    }
    expect(await compter()).toBe(avant);
  });

  it("le même compte sur deux réseaux, même mot et même instant : accepté et lu séparément", async () => {
    process.env.USINE_AGREGATS_CRM_SECRET = SECRET;
    const { POST } = await routes();
    const { lireAgregats } = await import("@/agregats");
    const j = jourRelatif(-4);
    const t = new Date(Date.now() + 2000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const corps = push(j, [ligne(j, "R1", "compte_reseau"), { ...ligne(j, "R1", "compte_reseau"), reseau: "instagram" }], t);
    expect((await POST(envoi(corps))).status).toBe(200);
    const lues = (await lireAgregats(j, j)).filter((l) => l.compte === "compte_reseau" && l.mot === "R1");
    expect(lues.map((l) => l.reseau).sort()).toEqual(["facebook", "instagram"]);
    expect((await POST(envoi(corps))).status).toBe(200);
    expect((await lireAgregats(j, j)).filter((l) => l.compte === "compte_reseau" && l.mot === "R1")).toHaveLength(2);
  });

  it("bandeau par compte en base : un compte à jour et un compte en retard = retard", async () => {
    const admin = new Pool({ connectionString: url });
    const s2 = `essai_${randomBytes(4).toString("hex")}`;
    await admin.query(`CREATE SCHEMA ${s2}`);
    const p2 = new Pool({ connectionString: url, options: `-c search_path=${s2}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    const { chiffresCrmEnRetard } = await import("@/agregats");
    const parisDe = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
    const jourParis = (n: number) => parisDe(Date.now() + n * 86_400_000);
    try {
      utiliserPool(p2);
      await jouerMigrations(p2);
      expect(await chiffresCrmEnRetard()).toBe(true);
      const ins = (jour: string, compte: string) => p2.query("INSERT INTO agregat_crm (jour, compte, mot, reseau, demandes, genere_le) VALUES ($1, $2, 'M', 'facebook', 10, now())", [jour, compte]);
      await ins(jourParis(-1), "compte_a");
      expect(await chiffresCrmEnRetard()).toBe(false);
      await ins(jourParis(-3), "compte_b");
      expect(await chiffresCrmEnRetard()).toBe(true);
      await ins(jourParis(-1), "compte_b");
      expect(await chiffresCrmEnRetard()).toBe(false);
      // Un jour entièrement masqué (marqueur seul, aucune ligne de chiffres) fait aussi reculer le retard.
      await p2.query("UPDATE agregat_crm SET jour = $1", [jourParis(-5)]);
      expect(await chiffresCrmEnRetard()).toBe(true);
      await p2.query("INSERT INTO agregat_crm_jour_recu (jour) VALUES ($1)", [jourParis(-1)]);
      expect(await chiffresCrmEnRetard()).toBe(false);
    } finally {
      utiliserPool(p);
      await p2.end();
      await admin.query(`DROP SCHEMA ${s2} CASCADE`);
      await admin.end();
    }
  });

  it("bandeau par compte en base : le marqueur d'un push ordinaire ne masque pas le retard d'un compte", async () => {
    const admin = new Pool({ connectionString: url });
    const s2 = `essai_${randomBytes(4).toString("hex")}`;
    await admin.query(`CREATE SCHEMA ${s2}`);
    const p2 = new Pool({ connectionString: url, options: `-c search_path=${s2}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    const { chiffresCrmEnRetard } = await import("@/agregats");
    const parisDe = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
    const jourParis = (n: number) => parisDe(Date.now() + n * 86_400_000);
    try {
      utiliserPool(p2);
      await jouerMigrations(p2);
      const ins = (jour: string, compte: string) => p2.query("INSERT INTO agregat_crm (jour, compte, mot, reseau, demandes, genere_le) VALUES ($1, $2, 'M', 'facebook', 10, now())", [jour, compte]);
      // (a) marqueur de J-1 ET ligne de compte_b à J-1 : compte_a (J-3) reste en retard.
      await ins(jourParis(-3), "compte_a");
      await ins(jourParis(-1), "compte_b");
      await p2.query("INSERT INTO agregat_crm_jour_recu (jour) VALUES ($1)", [jourParis(-1)]);
      expect(await chiffresCrmEnRetard()).toBe(true);
      // (b) jour entièrement masqué (marqueur sans aucune ligne ce jour-là) : pas en retard.
      await p2.query("UPDATE agregat_crm SET jour = $1", [jourParis(-5)]);
      await p2.query("UPDATE agregat_crm_jour_recu SET jour = $1", [jourParis(-2)]);
      await p2.query("INSERT INTO agregat_crm_jour_recu (jour) VALUES ($1) ON CONFLICT DO NOTHING", [jourParis(-1)]);
      expect(await chiffresCrmEnRetard()).toBe(false);
    } finally {
      utiliserPool(p);
      await p2.end();
      await admin.query(`DROP SCHEMA ${s2} CASCADE`);
      await admin.end();
    }
  });
});
