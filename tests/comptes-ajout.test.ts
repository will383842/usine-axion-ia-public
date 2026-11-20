/**
 * Mes comptes : ajouter un compte (réseau, identifiant, nom, nature), avertir en éteignant le dernier compte actif d'un réseau,
 * libellé neutre `diffuseur` (migration 046, sans toucher `actif` ni `etat`). Comptes fictifs en @example.com : rien de réel.
 */
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dossierMigrations, jouerMigrations } from "@/lib/migrations";
import { COMPTES_DEPART, PUBLIEUR_DEPART, SOURCE_COMPTES } from "@/import/depart";
import { avertissementDernierActif, lireSaisieCompte } from "@/app/reglages/comptes/saisie";

const session = vi.fn(async () => undefined);
const interrupteur = vi.fn(async () => true);
const lire = vi.fn();
const ecrire = vi.fn(async (..._a: unknown[]) => undefined);
const journaliser = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/services/auth", () => ({ exigerSession: () => session() }));
vi.mock("@/donnees", () => ({
  depots: { compte: { lire: (c: string) => lire(c), ecrire: (l: unknown) => ecrire(l) } },
  interrupteurAllume: () => interrupteur(),
  journaliser: (...a: unknown[]) => journaliser(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));

const bonne = { reseau: "youtube", identifiant: "chaine-d-essai", nom: "Chaîne d'essai", nature: "compte" };

describe("saisie d'un compte", () => {
  it("accepte un réseau connu, un identifiant du bon motif, un nom, une nature ; le code est « réseau:identifiant »", () => {
    expect(lireSaisieCompte(bonne)).toEqual({ ok: true, valeur: { code: "youtube:chaine-d-essai", reseau: "youtube", identifiant: "chaine-d-essai", nom: "Chaîne d'essai", nature: "compte" } });
    const r = lireSaisieCompte({ ...bonne, identifiant: "  Essai.Un_2  " });
    expect(r.ok && r.valeur.code).toBe("youtube:essai.un_2");
  });
  it("refuse, avec une phrase en français : réseau inconnu, identifiant hors motif ou vide, nom vide, nature inconnue", () => {
    for (const mauvais of [{ reseau: "myspace" }, { identifiant: "avec espace" }, { identifiant: "é" }, { identifiant: "" }, { nom: "  " }, { nature: "chaine" }, { identifiant: "a:b" }]) {
      const r = lireSaisieCompte({ ...bonne, ...mauvais });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/[a-zéè]{4}/i);
    }
  });
});

describe("avertissement du dernier compte actif d'un réseau", () => {
  const c = (code: string, reseau: string, actif: boolean) => ({ code, reseau, actif, etat: "propose", archive_le: null });
  it("éteindre le seul compte actif d'Instagram avertit ; en avoir un autre actif, ou éteindre un inactif, non", () => {
    const liste = [c("instagram:a", "instagram", true), c("facebook:a", "facebook", true), c("facebook:b", "facebook", true), c("instagram:b", "instagram", false)];
    expect(avertissementDernierActif(liste, "instagram:a")).toMatch(/Instagram/);
    expect(avertissementDernierActif(liste, "facebook:a")).toBeNull();
    expect(avertissementDernierActif(liste, "instagram:b")).toBeNull();
  });
});

describe("ajouterCompte", () => {
  beforeEach(() => {
    session.mockReset().mockResolvedValue(undefined);
    interrupteur.mockReset().mockResolvedValue(true);
    lire.mockReset().mockResolvedValue(undefined);
    ecrire.mockClear();
    journaliser.mockClear();
  });
  it("refuse sans session", async () => {
    session.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const { ajouterCompte } = await import("@/app/reglages/comptes/actions");
    await expect(ajouterCompte(bonne)).rejects.toThrow();
    expect(ecrire).not.toHaveBeenCalled();
  });
  it("interrupteur éteint : rien n'est écrit", async () => {
    interrupteur.mockResolvedValue(false);
    const { ajouterCompte } = await import("@/app/reglages/comptes/actions");
    expect((await ajouterCompte(bonne)).ok).toBe(false);
    expect(ecrire).not.toHaveBeenCalled();
  });
  it("écrit un compte éteint, à valider, au libellé neutre, et le note au journal", async () => {
    const { ajouterCompte } = await import("@/app/reglages/comptes/actions");
    expect((await ajouterCompte(bonne)).ok).toBe(true);
    expect(ecrire).toHaveBeenCalledWith(expect.objectContaining({ code: "youtube:chaine-d-essai", reseau: "youtube", identifiant: "chaine-d-essai", nature: "compte", nom: "Chaîne d'essai", publieur: "diffuseur", actif: false, etat: "propose" }));
    expect(journaliser).toHaveBeenCalledWith("compte", expect.stringContaining("ajouté"), { cible: "youtube:chaine-d-essai" });
  });
  it("un compte qui existe déjà : refusé avec une phrase, rien n'est écrit", async () => {
    lire.mockResolvedValue({ code: "youtube:chaine-d-essai" });
    const { ajouterCompte } = await import("@/app/reglages/comptes/actions");
    const r = await ajouterCompte(bonne);
    expect(r.ok).toBe(false);
    expect(ecrire).not.toHaveBeenCalled();
  });
  it("une saisie invalide : refusée, rien n'est écrit", async () => {
    const { ajouterCompte } = await import("@/app/reglages/comptes/actions");
    expect((await ajouterCompte({ ...bonne, identifiant: "Pas Bon" })).ok).toBe(false);
    expect(ecrire).not.toHaveBeenCalled();
  });
});

describe("libellé neutre du diffuseur", () => {
  it("les comptes de départ portent `diffuseur` et une source sans nom d'outil", () => {
    expect(PUBLIEUR_DEPART).toBe("diffuseur");
    expect(SOURCE_COMPTES).not.toMatch(/buffer/i);
    expect(COMPTES_DEPART.length).toBe(6);
  });
});

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("migration 046 · libellé neutre, sur une vraie base", () => {
  const schema = `essai_${randomBytes(4).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  let p: Pool;
  afterAll(async () => {
    await p?.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  it("met à jour publieur et source des lignes existantes sans toucher à actif ni etat, et se rejoue", async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 1 });
    await jouerMigrations(p);
    await p.query(
      "INSERT INTO compte (code, reseau, identifiant, nature, nom, publieur, actif, etat, source) VALUES ('instagram:essai', 'instagram', 'essai', 'compte', 'Essai', 'buffer', true, 'valide', 'Buffer, six comptes reliés au 12/10 ; CONTRATS-ECHANGE.md § 1 (compte.code)'), ('tiktok:essai', 'tiktok', 'essai', 'compte', 'Essai', 'buffer', false, 'propose', NULL), ('facebook:essai', 'facebook', 'essai', 'page', 'Essai', 'autre', true, 'valide', 'saisi')",
    );
    const fichier = readdirSync(dossierMigrations()).find((f) => f.startsWith("046-"));
    expect(fichier).toBeDefined();
    const sql = await readFile(path.join(dossierMigrations(), fichier!), "utf8");
    await p.query(sql);
    await p.query(sql);
    const { rows } = await p.query("SELECT code, publieur, actif, etat, source FROM compte ORDER BY code");
    expect(rows.map((r) => [r.code, r.publieur, r.actif, r.etat])).toEqual([
      ["facebook:essai", "autre", true, "valide"],
      ["instagram:essai", "diffuseur", true, "valide"],
      ["tiktok:essai", "diffuseur", false, "propose"],
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/buffer/i);
    expect(rows.find((r) => r.code === "facebook:essai")!.source).toBe("saisi");
  });
});
