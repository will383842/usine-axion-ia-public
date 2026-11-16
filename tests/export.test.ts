/** UO-08 · Export CSV des chiffres du mois et du calendrier : lecture seule, sans donnée de personne ni montant. Données fictives. Les essais de base exigent DATABASE_URL (PostgreSQL 16). */
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";
import { proxy } from "@/proxy";

vi.mock("@/services/auth", () => ({ exigerSession: vi.fn(async () => ({})) }));

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
const BOM = "﻿";

describe("export · CSV pur", () => {
  it("neutralise =, +, - et @ en tête de cellule (injection de formule)", async () => {
    const { neutraliser } = await import("@/export/csv");
    for (const c of ["=1+1", "+2", "-3", "@SOMME(A1)"]) expect(neutraliser(c)).toBe(`'${c}`);
    expect(neutraliser("texte")).toBe("texte");
    expect(neutraliser("a=b")).toBe("a=b");
  });

  it("UTF-8 avec BOM, séparateur « ; », guillemets doublés, dates JJ/MM/AAAA", async () => {
    const { versCsv, dateFrancaise } = await import("@/export/csv");
    expect(dateFrancaise("2026-10-05")).toBe("05/10/2026");
    const csv = versCsv(["Date", "Texte"], [["05/10/2026", 'a;b "c"'], ["x", "=cmd"]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain('Date;Texte');
    expect(csv).toContain('05/10/2026;"a;b ""c"""');
    expect(csv).toContain("x;'=cmd");
  });

  it("valide le mois AAAA-MM", async () => {
    const { moisValide } = await import("@/export/csv");
    expect(moisValide("2026-10")).toBe(true);
    for (const m of ["2026-13", "2026-00", "26-10", "2026-1", "", null, "2026-10-01"]) expect(moisValide(m as string | null)).toBe(false);
  });
});

describe("export · protection", () => {
  it("sans session, le proxy renvoie vers /connexion pour les deux exports", async () => {
    for (const chemin of ["/chiffres/export?mois=2026-10", "/calendrier/export?mois=2026-10"]) {
      const r = await proxy(new NextRequest(`http://localhost${chemin}`));
      expect(r.status).toBe(307);
      expect(new URL(r.headers.get("location")!).pathname).toBe("/connexion");
    }
  });
});

describe.skipIf(!url)("export · base", () => {
  let p: Pool;
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom) VALUES ('instagram:essai', 'instagram', 'essai', 'profil', 'Essai') ON CONFLICT DO NOTHING");
    await p.query("INSERT INTO mot (code, mot) VALUES ('mot-essai', 'ESSAI')");
    for (const s of ["2026-09-28", "2026-10-05", "2026-10-26", "2026-11-02"]) {
      await p.query("INSERT INTO releve_mot (semaine, mot, compte, commentaires, messages, demandes_guide, abonnes_gagnes) VALUES ($1, 'mot-essai', 'instagram:essai', 3, 2, 1, 4)", [s]);
    }
  });
  afterAll(async () => {
    await p?.end();
  });

  /** `text()` retire le BOM : on lit les octets et on vérifie le BOM à la main. */
  const lireBrut = async (r: Response) => {
    const o = Buffer.from(await r.arrayBuffer());
    expect([...o.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    return o.subarray(3).toString("utf8");
  };
  const GET = async (chemin: string, module: "chiffres" | "calendrier") => {
    const { GET } = module === "chiffres" ? await import("@/app/chiffres/export/route") : await import("@/app/calendrier/export/route");
    return GET(new NextRequest(`http://localhost${chemin}`));
  };

  it("chiffres : mois mal formé → 400 en français ; éteint → 404", async () => {
    const r = await GET("/chiffres/export?mois=oups", "chiffres");
    expect(r.status).toBe(400);
    expect(await r.text()).toMatch(/mois/i);
    expect((await GET("/chiffres/export?mois=2026-10", "chiffres")).status).toBe(404);
  });

  it("chiffres : les semaines dont le lundi tombe dans le mois, rien n'est écrit", async () => {
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'chiffres'");
    const avant = (await p.query("SELECT count(*)::int AS n FROM releve_mot")).rows[0].n;
    const r = await GET("/chiffres/export?mois=2026-10", "chiffres");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/csv.*utf-8/i);
    const lignes = (await lireBrut(r)).trim().split("\r\n");
    expect(lignes).toHaveLength(3);
    expect(lignes.join("\n")).toContain("05/10/2026");
    expect(lignes.join("\n")).toContain("26/10/2026");
    expect(lignes.join("\n")).not.toContain("28/09/2026");
    expect(lignes.join("\n")).not.toContain("02/11/2026");
    expect((await p.query("SELECT count(*)::int AS n FROM releve_mot")).rows[0].n).toBe(avant);
  });

  it("calendrier : date, réseau, type, état seulement ; mois mal formé → 400", async () => {
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'calendrier'");
    await p.query("INSERT INTO calendrier_ligne (reseau, type_contenu, prevue_le) VALUES ('instagram', 'carrousel', '2026-10-07T10:00:00+02') ");
    expect((await GET("/calendrier/export?mois=2026-1", "calendrier")).status).toBe(400);
    const r = await GET("/calendrier/export?mois=2026-10", "calendrier");
    expect(r.status).toBe(200);
    const [entete, ...corps] = (await lireBrut(r)).trim().split("\r\n");
    expect(entete).toBe("Date;Réseau;Type;État");
    expect(corps).toHaveLength(1);
    expect(corps[0].startsWith("07/10/2026;instagram;")).toBe(true);
    expect(entete).not.toMatch(/€|euro|prix|montant|nom|mail/i);
  });
});
