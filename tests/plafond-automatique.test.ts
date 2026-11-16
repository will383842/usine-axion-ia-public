/** PLAFOND-USINE-a · envoi du plafond des achats automatiques au Studio. Aucun appel réel : la passerelle est une doublure. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const reglerPlafondDuStudio = vi.fn();
let reelle: (c: number) => Promise<unknown>;
vi.mock("@/passerelles/studio", async (original) => {
  const vrai = (await original()) as { reglerPlafondDuStudio: (c: number) => Promise<unknown> };
  return { ...vrai, __reelle: vrai.reglerPlafondDuStudio, reglerPlafondDuStudio: (...a: unknown[]) => reglerPlafondDuStudio(...a) };
});

import { lireSaisieEuros } from "@/reglages/plafond-automatique";
import { PLAFOND_AUTO_MAX_CENTS } from "@/contrats";

describe("plafond automatique · saisie en euros", () => {
  it("convertit en centimes par la chaîne", () => {
    expect(lireSaisieEuros("20")).toBe(2000);
    expect(lireSaisieEuros("20,5")).toBe(2050);
    expect(lireSaisieEuros("20.50")).toBe(2050);
    expect(lireSaisieEuros(" 0 ")).toBe(0);
    expect(lireSaisieEuros("100")).toBe(10000);
    expect(lireSaisieEuros("\u00a020,5\u202f")).toBe(2050);
    expect(lireSaisieEuros("\u202f100\u00a0")).toBe(10000);
    expect(lireSaisieEuros("\t 20\n")).toBe(2000);
    expect(PLAFOND_AUTO_MAX_CENTS).toBe(10000);
  });
  it("refuse tout le reste", () => {
    for (const m of ["", "-1", "+5", "100,01", "1e2", "20,555", "abc", "Infinity", "NaN", "1000"]) expect(lireSaisieEuros(m), m).toBeNull();
  });
  it("refuse les espaces internes (« 1 0 » n'est pas 10 €)", () => {
    for (const m of ["1 0", " 1 0 ", "1\u00a00", "1\u202f0", "2 0,5", "20, 5", "20 ,5", "1\t0", "1 000"]) expect(lireSaisieEuros(m), JSON.stringify(m)).toBeNull();
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;
const CLE = "autonomie.plafond";

const reponse = (surcharge: Record<string, unknown> = {}) => ({
  envoye: true,
  statut: 200,
  corps: { mois: "2099-12", budget_mensuel_cents: 1, plafond_cents: 777777, deja: false, automatique: false, plafond_automatique_cents: 2000, ...surcharge },
});

describe.skipIf(!url)("plafond automatique · en base, avec une doublure du Studio", () => {
  let repere = 0;
  const brut = async () => (await p.query("SELECT valeur FROM reglage WHERE cle = $1", [CLE])).rows[0]?.valeur;
  const journal = async () => (await p.query("SELECT sujet, message, cible, donnees FROM journal WHERE cible = $1 AND id > $2 ORDER BY id", [CLE, repere])).rows;
  const reperer = async () => {
    repere = Number((await p.query("SELECT COALESCE(max(id), 0) AS m FROM journal")).rows[0].m);
  };
  const arret = (allume: boolean) => p.query("UPDATE interrupteur SET allume = $1 WHERE code = 'arret.tout'", [allume]);

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
    reelle = ((await import("@/passerelles/studio")) as unknown as { __reelle: (c: number) => Promise<unknown> }).__reelle;
  });
  afterAll(async () => {
    await p?.end();
  });
  beforeEach(async () => {
    reglerPlafondDuStudio.mockReset();
    reglerPlafondDuStudio.mockResolvedValue(reponse());
    await arret(false);
    await (await import("@/donnees")).ecrireReglage(CLE, {}); // illisible : lirePlafondAutomatique() rend null
    await reperer();
  });

  it("hors bornes : refus, passerelle jamais appelée, aucun journal, réglage inchangé", async () => {
    const { envoyerPlafondAutomatique } = await import("@/reglages/plafond-automatique");
    for (const c of [-1, 10001, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await envoyerPlafondAutomatique(c);
      expect(r).toMatchObject({ ok: false, raison: "hors_bornes" });
    }
    expect(reglerPlafondDuStudio).not.toHaveBeenCalled();
    expect(await journal()).toHaveLength(0);
    expect(await brut()).toEqual({});
  });

  it("200 conforme : une passerelle appelée, réglage écrit, une ligne de journal", async () => {
    const { envoyerPlafondAutomatique, lirePlafondAutomatique } = await import("@/reglages/plafond-automatique");
    const r = await envoyerPlafondAutomatique(2000);
    expect(r).toEqual({ ok: true, plafond_cents: 2000, deja: false });
    expect(reglerPlafondDuStudio).toHaveBeenCalledTimes(1);
    expect(reglerPlafondDuStudio).toHaveBeenCalledWith(2000);
    expect(await brut()).toEqual({ plafond_cents: 2000, accepte_le: expect.any(String), version: 1 });
    expect((await lirePlafondAutomatique())?.plafond_cents).toBe(2000);
    const j = await journal();
    expect(j).toHaveLength(1);
    expect(j[0].sujet).toBe("reglage");
    expect(j[0].message).toMatch(/accepté par le Studio/);
    expect(j[0].message).toMatch(/restent éteints/);
  });

  it("rejeu (deja) : ok, valeur inchangée", async () => {
    const { envoyerPlafondAutomatique } = await import("@/reglages/plafond-automatique");
    await envoyerPlafondAutomatique(2000);
    const avantRejeu = await brut();
    reglerPlafondDuStudio.mockResolvedValue(reponse({ deja: true }));
    expect(await envoyerPlafondAutomatique(2000)).toEqual({ ok: true, plafond_cents: 2000, deja: true });
    expect(await brut()).toEqual(avantRejeu);
  });

  it("refus et pannes : bonne raison, réglage précédent gardé, une ligne de journal", async () => {
    const { envoyerPlafondAutomatique } = await import("@/reglages/plafond-automatique");
    await envoyerPlafondAutomatique(2000);
    const avant = await brut();
    await reperer();
    const cas: Array<[string, () => void, string, number | undefined]> = [
      ["pas_branche", () => reglerPlafondDuStudio.mockResolvedValue({ envoye: false }), "pas_branche", undefined],
      ["sans_reponse", () => reglerPlafondDuStudio.mockRejectedValue(new Error("réseau")), "sans_reponse", undefined],
      ["400", () => reglerPlafondDuStudio.mockResolvedValue({ envoye: true, statut: 400, corps: null }), "refuse", 400],
      ["401", () => reglerPlafondDuStudio.mockResolvedValue({ envoye: true, statut: 401, corps: null }), "refuse", 401],
      ["429", () => reglerPlafondDuStudio.mockResolvedValue({ envoye: true, statut: 429, corps: null }), "refuse", 429],
      ["500", () => reglerPlafondDuStudio.mockResolvedValue({ envoye: true, statut: 500, corps: null }), "refuse", 500],
    ];
    for (const [nom, preparer, raison, statut] of cas) {
      preparer();
      const r = await envoyerPlafondAutomatique(5000);
      expect(r, nom).toMatchObject({ ok: false, raison });
      if (statut) expect(r).toMatchObject({ statut });
      expect(await brut(), nom).toEqual(avant);
    }
    expect(await journal()).toHaveLength(cas.length);
    // « Tout arrêter » : la passerelle n'est pas appelée.
    reglerPlafondDuStudio.mockReset();
    await arret(true);
    expect(await envoyerPlafondAutomatique(5000)).toMatchObject({ ok: false, raison: "arret" });
    expect(reglerPlafondDuStudio).not.toHaveBeenCalled();
    expect(await brut()).toEqual(avant);
  });

  it("réponse inattendue : rien n'est noté accepté ; si le Studio dit allumé, alerte au journal", async () => {
    const { envoyerPlafondAutomatique } = await import("@/reglages/plafond-automatique");
    reglerPlafondDuStudio.mockResolvedValue(reponse({ automatique: true }));
    expect(await envoyerPlafondAutomatique(2000)).toMatchObject({ ok: false, raison: "reponse_inattendue" });
    expect(await brut()).toEqual({});
    const j = await journal();
    expect(j.some((l) => /^Alerte : le Studio indique des achats automatiques allumés\.$/.test(l.message))).toBe(true);
    reglerPlafondDuStudio.mockResolvedValue(reponse({ plafond_automatique_cents: 1999 }));
    expect(await envoyerPlafondAutomatique(2000)).toMatchObject({ ok: false, raison: "reponse_inattendue" });
    reglerPlafondDuStudio.mockResolvedValue({ envoye: true, statut: 200, corps: "illisible" });
    expect(await envoyerPlafondAutomatique(2000)).toMatchObject({ ok: false, raison: "reponse_inattendue" });
    expect(await brut()).toEqual({});
  });

  it("le plafond global du Studio n'est ni gardé ni journalisé", async () => {
    const { envoyerPlafondAutomatique } = await import("@/reglages/plafond-automatique");
    await envoyerPlafondAutomatique(2000);
    const tout = JSON.stringify([await brut(), await journal()]);
    expect(tout).not.toContain("777777");
    expect(tout).not.toMatch(/Bearer|secret/i);
  });

  it("passerelle réelle, sans réseau : éteinte rend { envoye: false } ; hors bornes lève avant tout", async () => {
    expect(await reelle(2000)).toEqual({ envoye: false });
    await expect(reelle(10001)).rejects.toThrow();
    await expect(reelle(-1)).rejects.toThrow();
    await expect(reelle(1.5)).rejects.toThrow();
  });
});

describe("plafond automatique · garde-fous statiques", () => {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier).flatMap((n) => {
      const c = join(dossier, n);
      return statSync(c).isDirectory() ? fichiers(c) : [c];
    });
  it("aucun fichier de src/ ne peut produire l'état allumé", () => {
    for (const f of fichiers("src").filter((x) => /\.(ts|tsx)$/.test(x))) {
      const t = readFileSync(f, "utf8");
      expect(t, f).not.toMatch(/automatique\s*:\s*(true|!)/);
    }
  });
  it("la passerelle écrit l'état éteint en littéral, une seule fois, avec un seul paramètre", () => {
    const t = readFileSync("src/passerelles/studio.ts", "utf8");
    expect(t.match(/automatique: false/g)).toHaveLength(1);
    expect(t).toMatch(/function reglerPlafondDuStudio\(plafondCents: number\)/);
    expect(t).toMatch(/method: "PUT"/);
  });
  it("aucune migration ne crée d'interrupteur d'autonomie", () => {
    for (const f of readdirSync("migrations")) {
      const sql = readFileSync(join("migrations", f), "utf8");
      expect(sql, f).not.toMatch(/'(usine\.)?autonomie/i);
    }
  });
});
