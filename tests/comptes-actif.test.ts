/**
 * CPT-A · allumer ou éteindre un compte depuis « Mes comptes » : session exigée, interrupteur éteint = rien ne change,
 * geste noté au journal, réversible ; la migration 045 crée l'interrupteur éteint et ne réécrit jamais une ligne existante.
 * La partie base exige DATABASE_URL (PostgreSQL 16) ; sans elle, elle est sautée (la CI la fournit toujours).
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dossierMigrations, jouerMigrations } from "@/lib/migrations";

const session = vi.fn(async () => undefined);
const interrupteur = vi.fn(async () => true);
const lire = vi.fn();
const modifier = vi.fn(async (..._a: unknown[]) => undefined);
const journaliser = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/services/auth", () => ({ exigerSession: () => session() }));
vi.mock("@/donnees", () => ({
  depots: { compte: { lire: (c: string) => lire(c), modifier: (c: string, v: unknown) => modifier(c, v) } },
  interrupteurAllume: () => interrupteur(),
  journaliser: (...a: unknown[]) => journaliser(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const compte = (o: object = {}) => ({ code: "ig-1", nom: "Compte Instagram fictif", actif: false, etat: "propose", archive_le: null, ...o });

describe("allumerCompte", () => {
  beforeEach(() => {
    session.mockReset().mockResolvedValue(undefined);
    interrupteur.mockReset().mockResolvedValue(true);
    lire.mockReset().mockResolvedValue(compte());
    modifier.mockClear();
    journaliser.mockClear();
  });

  it("refuse sans session, sans rien écrire", async () => {
    session.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const { allumerCompte } = await import("@/app/reglages/comptes/actions");
    await expect(allumerCompte("ig-1", true)).rejects.toThrow();
    expect(modifier).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });

  it("interrupteur éteint : rien ne change", async () => {
    interrupteur.mockResolvedValue(false);
    const { allumerCompte } = await import("@/app/reglages/comptes/actions");
    await allumerCompte("ig-1", true);
    expect(modifier).not.toHaveBeenCalled();
  });

  it("allume un compte et note le geste ; le même geste en sens inverse l'éteint", async () => {
    const { allumerCompte } = await import("@/app/reglages/comptes/actions");
    await allumerCompte("ig-1", true);
    expect(modifier).toHaveBeenCalledWith("ig-1", { actif: true });
    expect(journaliser).toHaveBeenCalledWith("compte", "Compte Instagram fictif : allumé.", { cible: "ig-1" });
    lire.mockResolvedValue(compte({ actif: true }));
    await allumerCompte("ig-1", false);
    expect(modifier).toHaveBeenLastCalledWith("ig-1", { actif: false });
    expect(journaliser).toHaveBeenLastCalledWith("compte", "Compte Instagram fictif : éteint.", { cible: "ig-1" });
  });

  it("ne touche ni un compte déjà dans l'état demandé, ni un compte retiré ou archivé, ni un compte inconnu", async () => {
    const { allumerCompte } = await import("@/app/reglages/comptes/actions");
    lire.mockResolvedValue(compte({ actif: true }));
    await allumerCompte("ig-1", true);
    lire.mockResolvedValue(compte({ etat: "retire" }));
    await allumerCompte("ig-1", true);
    lire.mockResolvedValue(compte({ archive_le: "2026-01-01" }));
    await allumerCompte("ig-1", true);
    lire.mockResolvedValue(undefined);
    await allumerCompte("inconnu", true);
    expect(modifier).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });
});

const url = process.env.DATABASE_URL;
const pools: Pool[] = [];

describe.skipIf(!url)("migration 045 · interrupteur des comptes", () => {
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
  });

  it("créé éteint ; rejouer ne change rien ; une ligne existante n'est jamais réécrite", async () => {
    const schema = `essai_${randomBytes(4).toString("hex")}`;
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    pools.push(p);
    await jouerMigrations(p);
    const ligne = async () => (await p.query(`SELECT code, allume, archive_le FROM interrupteur WHERE code = 'comptes.actif'`)).rows;
    expect(await ligne()).toEqual([{ code: "comptes.actif", allume: false, archive_le: null }]);
    await p.query(`UPDATE interrupteur SET allume = true WHERE code = 'comptes.actif'`);
    await p.query(await readFile(path.join(dossierMigrations(), "045-interrupteur-comptes.sql"), "utf8"));
    expect(await ligne()).toEqual([{ code: "comptes.actif", allume: true, archive_le: null }]);
  });
});
