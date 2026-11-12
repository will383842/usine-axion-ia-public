/**
 * Porte du studio : garde (en-tête absent, faux, bon) ; porte éteinte sans secret ; restriction aux métiers demandés
 * (même éteints) ; aucun sujet retenu n'est reproposé ; types de contenu ; rien n'est écrit par une proposition ;
 * aucun écran modifié. Données fictives. Les essais de base exigent DATABASE_URL (PostgreSQL 16).
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MetierPorte, ReponseSujets, SujetPropose } from "@/contrats";
import { signature } from "@/tirage";
import { controlerAcces, enteteValide } from "@/porte/acces";
import { estPublic } from "@/proxy";

const SECRET = "secret-d-essai-de-la-porte-0123456789";
const SERVICES = ["formation", "audit", "coaching", "integration"];
const FAMILLES = ["scène vécue", "constat partagé", "contre-pied", "énumération", "idée reçue corrigée"];

const routes = async () => ({
  sujets: (await import("@/app/api/porte/sujets/route")).POST,
  retenir: (await import("@/app/api/porte/sujets/retenir/route")).POST,
  metiers: (await import("@/app/api/porte/metiers/route")).GET,
});

function post(chemin: string, corps: unknown, autorisation: string | null = `Bearer ${SECRET}`) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (autorisation !== null) headers.authorization = autorisation;
  return new Request(`http://localhost/api/porte/${chemin}`, { method: "POST", headers, body: JSON.stringify(corps) });
}

function get(chemin: string, autorisation: string | null = `Bearer ${SECRET}`) {
  return new Request(`http://localhost/api/porte/${chemin}`, { headers: autorisation === null ? {} : { authorization: autorisation } });
}

afterEach(() => {
  delete process.env.USINE_PORTE_SECRET;
});

describe("porte · garde", () => {
  it("compare l'en-tête au secret : absent, faux, bon", () => {
    expect(enteteValide(null, SECRET)).toBe(false);
    expect(enteteValide("", SECRET)).toBe(false);
    expect(enteteValide(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(enteteValide(`bearer ${SECRET}`, SECRET)).toBe(false);
    expect(enteteValide(SECRET, SECRET)).toBe(false);
    expect(enteteValide(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuse en 401 un appel sans en-tête ou avec un faux secret, sans toucher la base", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const { sujets, retenir, metiers } = await routes();
    const corps = { n: 1, type_contenu: "video", reseaux: ["instagram"] };
    for (const auth of [null, "Bearer faux", `Bearer ${SECRET.slice(0, -1)}`, `Basic ${SECRET}`]) {
      const r = await sujets(post("sujets", corps, auth));
      expect(r.status).toBe(401);
      expect(JSON.stringify(await r.json())).not.toContain(SECRET);
      expect((await retenir(post("sujets/retenir", {}, auth))).status).toBe(401);
      expect((await metiers(get("metiers", auth))).status).toBe(401);
    }
  });

  it("porte éteinte : secret absent ou trop court, toutes les routes rendent 404", async () => {
    const { sujets, retenir, metiers } = await routes();
    for (const secret of [undefined, "", "court"]) {
      if (secret === undefined) delete process.env.USINE_PORTE_SECRET;
      else process.env.USINE_PORTE_SECRET = secret;
      expect(controlerAcces(get("metiers", `Bearer ${secret}`))).toBe("eteinte");
      expect((await sujets(post("sujets", {}, `Bearer ${secret}`))).status).toBe(404);
      expect((await retenir(post("sujets/retenir", {}, `Bearer ${secret}`))).status).toBe(404);
      expect((await metiers(get("metiers", `Bearer ${secret}`))).status).toBe(404);
    }
  });

  it("le proxy laisse passer les trois routes de la porte, et elles seules", () => {
    for (const p of ["/api/porte/sujets", "/api/porte/sujets/retenir", "/api/porte/metiers"]) expect(estPublic(p)).toBe(true);
    for (const p of ["/api/porte", "/api/porte/autre", "/api/porte/sujets/autre", "/porte/sujets"]) expect(estPublic(p)).toBe(false);
  });

  it("refuse une demande hors contrat (zod strict) avant la base", async () => {
    process.env.USINE_PORTE_SECRET = SECRET;
    const { sujets } = await routes();
    const ok = { n: 3, type_contenu: "video", reseaux: ["instagram"] };
    for (const corps of [
      { ...ok, n: 0 },
      { ...ok, n: 21 },
      { ...ok, type_contenu: "podcast" },
      { ...ok, reseaux: [] },
      { ...ok, reseaux: ["myspace"] },
      { ...ok, metiers: ["pas un code"] },
      { ...ok, autre: true },
    ]) {
      const r = await sujets(post("sujets", corps));
      expect(r.status, JSON.stringify(corps)).toBe(400);
    }
    const sansJson = new Request("http://localhost/api/porte/sujets", { method: "POST", headers: { authorization: `Bearer ${SECRET}`, "content-type": "text/plain" }, body: "x" });
    expect((await sujets(sansJson)).status).toBe(415);
    const gros = new Request("http://localhost/api/porte/sujets", { method: "POST", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json", "content-length": String(16 * 1024 + 1) }, body: "{}" });
    const refus = await sujets(gros);
    expect(refus.status).toBe(413);
    expect((await refus.json()).code).toBe("corps_trop_grand");
    // Sans content-length (flux) : coupé dès le dépassement, sans lire le reste.
    let envoyes = 0;
    const flux = new ReadableStream<Uint8Array>({
      pull(c) {
        envoyes += 1024;
        c.enqueue(new Uint8Array(1024).fill(120));
        if (envoyes >= 1024 * 1024) c.close();
      },
    });
    const enflux = new Request("http://localhost/api/porte/sujets", { method: "POST", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" }, body: flux, duplex: "half" } as RequestInit);
    expect(enflux.headers.get("content-length")).toBeNull();
    const refusFlux = await sujets(enflux);
    expect(refusFlux.status).toBe(413);
    expect((await refusFlux.json()).code).toBe("corps_trop_grand");
    expect(envoyes).toBeLessThan(64 * 1024);
  });
});

describe("porte · aucun écran modifié", () => {
  it("la branche ne touche ni src/app (hors /api/porte) ni src/components", () => {
    const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    let base: string | null = null;
    for (const ref of ["origin/main", "HEAD^1"]) {
      try {
        base = git("merge-base", "HEAD", ref);
        break;
      } catch {
        // Clone sans cette référence : on essaie la suivante.
      }
    }
    if (!base) return;
    // La règle vaut pour une branche de la porte (qui touche src/porte), pas pour les autres branches.
    if (!git("diff", "--name-only", base, "--", "src/porte", "src/app/api/porte")) return;
    const changes = git("diff", "--name-only", base, "--", "src/app", "src/components").split("\n").filter(Boolean);
    expect(changes.filter((f) => !f.startsWith("src/app/api/porte/"))).toEqual([]);
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("porte · en base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("INSERT INTO secteur (code, nom) VALUES ('essai', 'Secteur d''essai')");
    for (const [i, s] of SERVICES.entries()) await p.query("INSERT INTO service (code, nom, ordre) VALUES ($1, $1, $2) ON CONFLICT (code) DO NOTHING", [s, i]);
    for (const [code, allume] of [["essai.un", true], ["essai.deux", true], ["essai.eteint", false]] as const) {
      await p.query("INSERT INTO metier (code, secteur, nom, allume, etat) VALUES ($1, 'essai', $2, $3, 'valide')", [code, `Métier ${code}`, allume]);
      for (const s of SERVICES) {
        await p.query("INSERT INTO douleur (code, cible, services, dite, etat) VALUES ($1, $2, $3, 'Une douleur dite.', 'valide')", [`${code}.d${SERVICES.indexOf(s) + 1}`, code, s]);
        for (const k of [1, 2]) {
          await p.query("INSERT INTO cas_usage (code, cible, service, titre, source, etat) VALUES ($1, $2, $3, $4, $5, 'valide')", [`${code}.${s}.c0${k}`, code, s, `Cas ${k}`, k === 1 ? "https://exemple.example.com/source" : null]);
        }
      }
    }
    for (const t of ["TPE", "PME", "ETI", "GE"]) await p.query("INSERT INTO taille (code, nom, poids, actif) VALUES ($1, $1, '1', 'oui')", [t]);
    for (const [i, f] of FAMILLES.entries()) {
      await p.query("INSERT INTO accroche (code, famille, types_contenu, modele, etat) VALUES ($1, $2, 'video ; carrousel', 'Un modèle.', 'valide')", [`accroche.essai-${i}`, f]);
    }
    await p.query("INSERT INTO format_video (code, nom, statut, en_lot, etat) VALUES ('tableau-anime', 'Tableau animé', 'actif', 'oui', 'valide')");
    await p.query("INSERT INTO format_autre (code, etat_service, etat) VALUES ('carrousel', 'en_service', 'valide')");
    await p.query(
      "INSERT INTO appel (code, reseaux, cible, type_contenu, type, objectif, dit, etat) VALUES ('fin-if-question', 'instagram ; facebook', 'clients', 'video ; carrousel', 'question', 'QUESTION', 'Et chez vous ?', 'valide')",
    );
  });

  afterAll(async () => {
    await p?.end();
  });

  beforeEach(() => {
    process.env.USINE_PORTE_SECRET = SECRET;
  });

  async function proposer(corps: Record<string, unknown>): Promise<ReponseSujets> {
    const { sujets } = await routes();
    const r = await sujets(post("sujets", { type_contenu: "video", reseaux: ["instagram", "facebook"], ...corps }));
    expect(r.status).toBe(200);
    return (await r.json()) as ReponseSujets;
  }

  const ecrits = async () =>
    (await p.query("SELECT (SELECT count(*) FROM deja_fabrique) + (SELECT count(*) FROM lot) + (SELECT count(*) FROM lot_ligne) + (SELECT count(*) FROM journal) AS n")).rows[0].n;

  it("bonne clé : la liste des métiers, allumés ou non, avec leurs cas sourcés", async () => {
    const { metiers } = await routes();
    const r = await metiers(get("metiers"));
    expect(r.status).toBe(200);
    const { metiers: liste } = (await r.json()) as { metiers: MetierPorte[] };
    expect(liste.map((m) => m.code).sort()).toEqual(["essai.deux", "essai.eteint", "essai.un"]);
    const eteint = liste.find((m) => m.code === "essai.eteint")!;
    expect(eteint).toEqual({ code: "essai.eteint", libelle: "Métier essai.eteint", secteur: { code: "essai", libelle: "Secteur d'essai" }, allume: false, cas_sources: 4 });
  });

  it("sans métier demandé : les métiers allumés seulement ; aucun allumé : réponse claire", async () => {
    const avant = await ecrits();
    for (let g = 0; g < 4; g++) {
      const r = await proposer({ n: 6, graine: g });
      expect(r.lignes.length).toBeGreaterThan(0);
      expect(r.lignes.every((l) => l.metier && ["essai.un", "essai.deux"].includes(l.metier.code))).toBe(true);
    }
    expect(await ecrits()).toBe(avant);
    await p.query("UPDATE metier SET allume = false");
    const { sujets } = await routes();
    const r = await sujets(post("sujets", { n: 3, type_contenu: "video", reseaux: ["instagram"] }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "aucun_metier_allume", erreur: "Aucun métier allumé : choisissez un métier." });
    await p.query("UPDATE metier SET allume = true WHERE code IN ('essai.un', 'essai.deux')");
  });

  it("métiers demandés : le tirage s'y restreint, même éteints, avec les textes lisibles", async () => {
    const r = await proposer({ n: 5, metiers: ["essai.eteint"], graine: 7 });
    expect(r.lignes).toHaveLength(5);
    expect(r.pourquoi).toEqual([]);
    for (const l of r.lignes) {
      expect(l.metier).toEqual({ code: "essai.eteint", libelle: "Métier essai.eteint", secteur: "Secteur d'essai" });
      expect(l.cas_usage?.titre).toMatch(/^Cas [12]$/);
      expect(l.douleur?.dite).toBe("Une douleur dite.");
      expect(l.format).toEqual({ code: "tableau-anime", libelle: "Tableau animé" });
      expect(l.accroche.modele).toBe("Un modèle.");
      expect(l.fins.instagram?.dit).toBe("Et chez vous ?");
    }
    const { sujets } = await routes();
    const inconnu = await sujets(post("sujets", { n: 2, type_contenu: "video", reseaux: ["instagram"], metiers: ["essai.absent"] }));
    expect(inconnu.status).toBe(400);
    // Filtres de taille et de service respectés.
    const filtre = await proposer({ n: 4, metiers: ["essai.un", "essai.deux"], tailles: ["PME"], services: ["audit"], graine: 3 });
    expect(filtre.lignes.length).toBeGreaterThan(0);
    expect(filtre.lignes.every((l) => l.taille?.code === "PME" && l.service?.code === "audit")).toBe(true);
  });

  it("types de contenu : la vidéo se tire ; carrousel et image, pas encore en service (FORMATS_EN_SERVICE), disent pourquoi", async () => {
    const video = await proposer({ n: 3, metiers: ["essai.un"], graine: 1 });
    expect(video.lignes).toHaveLength(3);
    expect(video.lignes.every((l) => l.type_contenu === "video" && l.format.code === "tableau-anime")).toBe(true);
    // Depuis L2-05, un format n'est proposé que si son type est dans FORMATS_EN_SERVICE (la vidéo seule au départ) :
    // la ligne « carrousel » de la base 5 est en service, mais le type reste « bientôt » tant que Will ne l'ouvre pas.
    for (const type_contenu of ["carrousel", "image"] as const) {
      const r = await proposer({ n: 3, metiers: ["essai.un"], type_contenu, graine: 1 });
      expect(r.lignes).toEqual([]);
      expect(r.pourquoi[0].message).toMatch(new RegExp(`Aucun format « ${type_contenu} » en service`));
    }
  });

  it("retenir : idempotent, et le sujet retenu n'est plus jamais proposé", async () => {
    const { retenir } = await routes();
    const [l] = (await proposer({ n: 1, metiers: ["essai.eteint"], graine: 11 })).lignes as SujetPropose[];
    const corps = { signature: l.signature, parts: l.parts, type_contenu: l.type_contenu, reference_studio: "0042-AV-TT" };
    const r1 = await retenir(post("sujets/retenir", corps));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ signature: l.signature, deja: false });
    const r2 = await retenir(post("sujets/retenir", corps));
    expect(await r2.json()).toEqual({ signature: l.signature, deja: true });
    const lignes = (await p.query("SELECT signature, code_version, cas_usage FROM deja_fabrique WHERE signature = $1", [l.signature])).rows;
    expect(lignes).toEqual([{ signature: l.signature, code_version: "0042-AV-TT", cas_usage: l.parts.cas_usage }]);
    for (let g = 0; g < 10; g++) {
      const r = await proposer({ n: 20, metiers: ["essai.eteint"], graine: 100 + g });
      expect(r.lignes.map((x) => x.signature)).not.toContain(l.signature);
    }
    // Signature qui ne correspond pas à ses parts : refusée.
    const faux = await retenir(post("sujets/retenir", { ...corps, signature: "autre" }));
    expect(faux.status).toBe(400);
  });

  it("retenir : un cas d'usage exige métier et structure ; une nouveauté, la structure ; douleur et cas peuvent être nuls", async () => {
    const { retenir } = await routes();
    const [l] = (await proposer({ n: 1, metiers: ["essai.eteint"], graine: 11 })).lignes as SujetPropose[];
    for (const part of ["metier", "structure"] as const) {
      const parts = { ...l.parts, [part]: null };
      const r = await retenir(post("sujets/retenir", { signature: signature(parts), parts, type_contenu: l.type_contenu, reference_studio: "0042-AV-TT" }));
      expect(r.status, part).toBe(400);
      expect((await r.json()).code).toBe("parts_absentes");
    }
    // Cas d'usage sans douleur : accepté.
    const sansDouleur = { ...l.parts, douleur: null };
    const ok = await retenir(post("sujets/retenir", { signature: signature(sansDouleur), parts: sansDouleur, type_contenu: l.type_contenu, reference_studio: "0042-AV-TT" }));
    expect(ok.status).toBe(200);
    const nouveaute = { metier: null, taille: null, service: null, douleur: null, cas_usage: null, actualite: "act.essai", format: l.parts.format, structure: null };
    const r = await retenir(post("sujets/retenir", { signature: signature(nouveaute), parts: nouveaute, type_contenu: l.type_contenu, reference_studio: "0042-AV-TT" }));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("parts_absentes");
  });

  it("retenir : une nouveauté proposée par /sujets (métier, taille, service, douleur, cas nuls) est retenue telle quelle", async () => {
    const { retenir } = await routes();
    await p.query("INSERT INTO famille (code, nom, rythme_cible, etat) VALUES ('B', 'Actualités', '1', 'valide')");
    await p.query("INSERT INTO accroche (code, famille, types_contenu, modele, etat) VALUES ('accroche.essai-actu', 'actualité', 'video ; carrousel', 'Un modèle.', 'valide')");
    await p.query(
      "INSERT INTO actualite (code, titre, ce_qui_change_pour_un_dirigeant, source, perime_le, retenue, etat) VALUES ('act.essai', 'Nouveauté d''essai', 'Un changement.', 'https://exemple.example.com/actu', '2999-01-01', 'oui', 'valide')",
    );
    const lignes = (await proposer({ n: 20, metiers: ["essai.un"], graine: 5 })).lignes as SujetPropose[];
    const l = lignes.find((x) => x.parts.actualite);
    expect(l, "une nouveauté est proposée").toBeDefined();
    expect(l!.parts).toMatchObject({ metier: null, taille: null, service: null, douleur: null, cas_usage: null, actualite: "act.essai" });
    const r = await retenir(post("sujets/retenir", { signature: l!.signature, parts: l!.parts, type_contenu: l!.type_contenu, reference_studio: "0042-AV-TT" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ signature: l!.signature, deja: false });
  });
});
