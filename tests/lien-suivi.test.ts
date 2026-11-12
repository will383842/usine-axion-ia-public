/**
 * L2-08 · Lien suivi unique (ADR 0002) : mêmes fixtures que le studio ; divergence = rouge.
 * Sans base.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVITES_LIEN, construireLienSuivi, ErreurLienSuivi, NATURES_LIEN, RESEAUX, RESEAUX_MESSAGE, type EntreeLienSuivi } from "@/contrats";

const CHEMIN = "tests/fixtures/0002-lien-suivi-unique.fixtures.json";
const brut = readFileSync(CHEMIN);
/** Empreinte de la copie qui fait foi (version 2 de l'ADR 0002, identique à celle du Studio). */
const EMPREINTE = "a47bdee5a1cf3e36da85ac2a31b643fc01feefa035a90b2ec4a92253d5184baa";

type Entree = { type_lien: string; reseau: string; code: string; activite: string; page: string };
const fixtures = JSON.parse(brut.toString("utf8")) as {
  regles: { ordre: string[]; code_version: string; code_mot: string; longueur_max: number };
  construction: {
    valides: { id: string; entree: Entree; attendu: string }[];
    refus: { id: string; entree: Entree; refus: string }[];
  };
};

function entree(e: Entree): EntreeLienSuivi {
  return { typeLien: e.type_lien, reseau: e.reseau, code: e.code, activite: e.activite, page: e.page };
}

describe("lien suivi · fixtures de l'ADR 0002", () => {
  it("la copie des fixtures est celle de l'ADR (empreinte)", () => {
    expect(createHash("sha256").update(brut).digest("hex")).toBe(EMPREINTE);
  });

  it("T1 · chaque cas valide donne l'adresse exacte (au moins 12)", () => {
    expect(fixtures.construction.valides.length).toBeGreaterThanOrEqual(12);
    for (const v of fixtures.construction.valides) expect(construireLienSuivi(entree(v.entree)), v.id).toBe(v.attendu);
  });

  it("T2 · chaque refus lève le code attendu, sans adresse partielle", () => {
    for (const r of fixtures.construction.refus) {
      let erreur: unknown = null;
      let rendu: string | null = null;
      try {
        rendu = construireLienSuivi(entree(r.entree));
      } catch (e) {
        erreur = e;
      }
      expect(rendu, r.id).toBeNull();
      expect(erreur, r.id).toBeInstanceOf(ErreurLienSuivi);
      expect((erreur as ErreurLienSuivi).refus, r.id).toBe(r.refus);
    }
  });

  it("T3 · propriétés de toute adresse produite (fixtures et 1 000 tirages)", () => {
    const codeVersion = new RegExp(fixtures.regles.code_version);
    const codeMot = new RegExp(fixtures.regles.code_mot);
    let graine = 42;
    const hasard = (n: number) => {
      graine = (graine * 1664525 + 1013904223) % 4294967296;
      return graine % n;
    };
    const choisir = <T,>(l: readonly T[]) => l[hasard(l.length)];
    const entrees: EntreeLienSuivi[] = fixtures.construction.valides.map((v) => entree(v.entree));
    for (let i = 0; i < 1000; i++) {
      const typeLien = choisir(NATURES_LIEN);
      const reseau = typeLien === "message" ? choisir(RESEAUX_MESSAGE) : choisir(RESEAUX);
      const code = typeLien === "video" || typeLien === "post" ? `${String(hasard(10000)).padStart(4, "0")}-TB-IG${hasard(2) ? "-R1" : ""}` : `mot-${choisir(["guide", "audit", "a1"])}`;
      entrees.push({ typeLien, reseau, code, activite: choisir(ACTIVITES_LIEN), page: choisir(["/fr/appel", "/fr/guide-ia", "/fr/diagnostic"]) });
    }
    for (const e of entrees) {
      const url = new URL(construireLienSuivi(e));
      expect(url.origin).toBe("https://axion-ia.com");
      expect(url.hash).toBe("");
      expect([...url.searchParams.keys()]).toEqual(url.searchParams.has("depuis") ? fixtures.regles.ordre : fixtures.regles.ordre.slice(0, 4));
      const texte = url.toString();
      expect(texte.slice("https://".length)).not.toContain(":");
      expect(texte).not.toMatch(/usine:|@|entete/);
      const p = url.searchParams;
      expect(p.has("depuis")).toBe(url.pathname === "/fr/appel");
      if (p.has("depuis")) expect(p.get("depuis")).toBe(`${p.get("utm_medium")}-${p.get("utm_source")}`);
      expect(p.get("utm_medium") === "video" || p.get("utm_medium") === "post" ? codeVersion.test(p.get("utm_campaign")!) : codeMot.test(p.get("utm_campaign")!)).toBe(true);
      for (const v of p.values()) expect(v).toMatch(/^[A-Za-z0-9-]{1,60}$/);
    }
  });
});

describe("lien suivi · aucun lien écrit à la main", () => {
  it("T4 · `utm_` n'apparaît que dans le constructeur et ses essais", () => {
    const trouves = execFileSync("git", ["grep", "--untracked", "-l", "utm_", "--", "src"], { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(trouves).toEqual(["src/contrats/lien-suivi.ts"]);
  });
});
