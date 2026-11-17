/**
 * L7-03 · Déploiement de l'usine : variables obligatoires, bases absentes, version dans /api/sante,
 * et forme du flux de déploiement (job de contrôle intact, déploiement séparé qui échoue sans secrets).
 * Aucun appel réel, aucun secret lu : le flux est lu comme du texte.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jouerMigrations = vi.fn(async () => ({ jouees: [], dejaJouees: [], modifiees: [] }));
const lireFichiersBases = vi.fn();
const importerSiBesoin = vi.fn(async () => "inchangees");
vi.mock("@/lib/base", () => ({ pool: () => ({}), baseConfiguree: () => false, requete: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/migrations", () => ({ jouerMigrations }));
vi.mock("@/import/importer", () => ({ lireFichiersBases }));
vi.mock("@/import/automatique", () => ({ importerSiBesoin }));

const ENV = { ...process.env };
const lignes = (espion: { mock: { calls: unknown[][] } }) => espion.mock.calls.map((a) => a.join(" "));

beforeEach(() => {
  vi.resetModules();
  jouerMigrations.mockClear();
  lireFichiersBases.mockReset();
  importerSiBesoin.mockClear();
});
afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

describe("démarrage : variables obligatoires", () => {
  it("en production, une variable absente arrête le serveur avec un message qui nomme la variable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.DATABASE_URL;
    delete process.env.SESSION_SECRET;
    const sortie = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { demarrer } = await import("@/lib/demarrage");
    await demarrer();
    expect(sortie).toHaveBeenCalledWith(1);
    const texte = lignes(erreur).join("\n");
    expect(texte).toContain("DATABASE_URL");
    expect(texte).toContain("SESSION_SECRET");
  });
});

describe("démarrage : dossier bases/ absent", () => {
  it("une ligne claire, aucun plantage, aucun chargement tenté", async () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.DATABASE_URL = "postgres://exemple@example.com/x";
    process.env.SESSION_SECRET = "x".repeat(32);
    lireFichiersBases.mockRejectedValue(Object.assign(new Error("ENOENT: no such file or directory, scandir 'bases'"), { code: "ENOENT" }));
    const sortie = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { demarrer } = await import("@/lib/demarrage");
    const r = await demarrer();
    await expect(r.bases).resolves.toBe("absentes");
    expect(sortie).not.toHaveBeenCalled();
    expect(importerSiBesoin).not.toHaveBeenCalled();
    expect(lignes(journal).some((l) => l.includes("[usine] bases : dossier bases/ absent"))).toBe(true);
    expect(lignes(erreur).join("\n")).not.toContain("ENOENT");
  });
});

describe("/api/sante : version du code", () => {
  it("expose la version, sans sha des bases ni secret", async () => {
    process.env.USINE_VERSION = "sha-abc1234";
    const temoin = ["temoin", "de", "controle", "0123456789abcdef"].join("-");
    vi.stubEnv("SESSION_SECRET", temoin);
    process.env.DATABASE_URL = "";
    const { GET } = await import("@/app/api/sante/route");
    const corps = await (await GET()).json();
    expect(corps.version).toBe("sha-abc1234");
    const texte = JSON.stringify(corps);
    expect(texte).not.toContain(temoin);
    expect(texte).not.toMatch(/[0-9a-f]{40}/);
    expect(Object.keys(corps.bases)).toEqual(["empreinte"]);
  });
  it("sans variable de version : « inconnue », jamais vide", async () => {
    delete process.env.USINE_VERSION;
    const { GET } = await import("@/app/api/sante/route");
    expect((await (await GET()).json()).version).toBe("inconnue");
  });
});

describe("flux de déploiement (.github/workflows/ci.yml)", () => {
  const flux = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
  const bloc = (job: string) => {
    const debut = flux.indexOf(`\n  ${job}:\n`);
    expect(debut).toBeGreaterThan(-1);
    const suite = flux.slice(debut + 1).search(/\n  [a-z]+:\n/);
    return suite === -1 ? flux.slice(debut) : flux.slice(debut, debut + 1 + suite);
  };

  it("le job de contrôle garde son nom exact et toutes ses étapes, sans condition", () => {
    const v = bloc("verifier");
    expect(v).toContain("name: Types, lint, garde, tests, build");
    expect(v).not.toMatch(/\n    if:/);
    for (const e of ["Garde anti-fuite", "pnpm install --frozen-lockfile", "pnpm typecheck", "pnpm lint", "pnpm garde", "pnpm test", "pnpm build"]) expect(v).toContain(e);
  });

  it("le déploiement est un job séparé, jamais sur une PR, sans interrupteur qui le saute en vert", () => {
    const d = bloc("deployer");
    const condition = d.match(/\n    if: ([^\n]*)/)?.[1] ?? "";
    expect(condition).toContain("refs/heads/main");
    expect(condition).not.toContain("pull_request ");
    expect(condition).not.toContain("USINE_DEPLOY_ACTIF");
    expect(flux).toMatch(/on:[\s\S]*workflow_dispatch:/);
    expect(d).toContain("environment: usine-production");
  });

  it("sans secrets, le déploiement échoue avec un message clair", () => {
    const d = bloc("deployer");
    expect(d).toMatch(/if \[ -z "\$CLE" \][^\n]*\n[^\n]*::error::[^\n]*exit 1/);
    expect(d).toContain("secrets de déploiement absents");
  });

  it("la version du code entre dans l'image", () => {
    expect(flux).toContain("USINE_VERSION=sha-");
    expect(readFileSync(join(process.cwd(), "Dockerfile"), "utf8")).toMatch(/ARG USINE_VERSION[\s\S]*ENV[^\n]*USINE_VERSION/);
  });
});
