/**
 * T14 · Quatre semaines saisies donnent une courbe par mot ; le rapport compare abonnés gagnés et demandes de guide ;
 * une semaine se corrige sans doublon. Données fictives. Les essais de base exigent DATABASE_URL (PostgreSQL 16).
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";
import { lundiDe, rapportDuMot, schemaReleve, serieDuMot } from "@/chiffres/regles";

describe("chiffres · règles", () => {
  it("la semaine saisie est ramenée au lundi ; un champ vide vaut 0 ; un nombre négatif est refusé", () => {
    const r = schemaReleve.parse({ semaine: "2026-10-14", mot: "mot-guide", compte: "instagram:exemple", commentaires: "", messages: "3", demandesGuide: "2", abonnesGagnes: "5" });
    expect(r).toMatchObject({ semaine: "2026-10-12", commentaires: 0, messages: 3 });
    expect(lundiDe("2026-10-18")).toBe("2026-10-12");
    expect(schemaReleve.safeParse({ ...r, abonnesGagnes: "-1" }).success).toBe(false);
  });

  it("série et rapport : sommes sur les comptes, semaines sans saisie à zéro", () => {
    const l = (semaine: string, d: number, a: number) => ({ semaine, commentaires: 0, messages: 0, demandes_guide: d, abonnes_gagnes: a });
    const serie = serieDuMot([l("2026-10-05", 2, 4), l("2026-10-05", 1, 1), l("2026-10-12", 0, 3)], "2026-10-12", 3);
    expect(serie.map((p) => [p.semaine, p.saisie, p.demandes_guide, p.abonnes_gagnes])).toEqual([
      ["2026-09-28", false, 0, 0],
      ["2026-10-05", true, 3, 5],
      ["2026-10-12", true, 0, 3],
    ]);
    expect(rapportDuMot(serie)).toEqual({ abonnesGagnes: 8, demandesGuide: 3, abonnesParDemande: 2.7 });
    expect(rapportDuMot([]).abonnesParDemande).toBeNull();
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("chiffres · base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("UPDATE interrupteur SET allume = true WHERE code IN ('chiffres', 'ma-journee.releve-mot')");
    await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom) VALUES ('instagram:essai', 'instagram', 'essai', 'profil', 'Essai') ON CONFLICT DO NOTHING");
    await p.query("INSERT INTO mot (code, mot) VALUES ('mot-essai', 'ESSAI')");
  });
  afterAll(async () => {
    await p?.end();
  });

  it("quatre semaines saisies donnent une courbe ; la carte disparaît une fois la semaine saisie", async () => {
    const { enregistrerReleve, enregistrerObjectif, vueDesChiffres, cartesDesChiffres, ErreurChiffres } = await import("@/chiffres");
    const { aujourdhuiParis } = await import("@/chiffres");
    const lundi = lundiDe(await aujourdhuiParis());
    expect(await cartesDesChiffres()).toHaveLength(1);
    const semaines = [21, 14, 7, 0].map((n) => new Date(Date.parse(`${lundi}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10));
    for (const [i, semaine] of semaines.entries()) await enregistrerReleve({ semaine, mot: "mot-essai", compte: "instagram:essai", commentaires: 5 + i, messages: 4, demandesGuide: i + 1, abonnesGagnes: 2 * i });
    await enregistrerReleve({ semaine: lundi, mot: "mot-essai", compte: "instagram:essai", commentaires: 9, messages: 4, demandesGuide: 4, abonnesGagnes: 6 });
    expect((await p.query("SELECT count(*)::int AS n FROM releve_mot")).rows[0].n).toBe(4);
    const vue = await vueDesChiffres(lundi);
    const essai = vue.mots.find((m) => m.mot.code === "mot-essai")!;
    expect(essai.serie.filter((s) => s.saisie)).toHaveLength(4);
    expect(essai.serie.slice(-4).map((s) => s.demandes_guide)).toEqual([1, 2, 3, 4]);
    expect(essai.rapport).toMatchObject({ demandesGuide: 10, abonnesGagnes: 0 + 2 + 4 + 6 });
    expect(await cartesDesChiffres()).toHaveLength(0);
    await expect(enregistrerReleve({ semaine: lundi, mot: "mot-inconnu", compte: "instagram:essai" })).rejects.toThrow(ErreurChiffres);
    await enregistrerObjectif({ compte: "instagram:essai", objectif: "Doubler les vues en un trimestre" });
    expect((await p.query("SELECT objectif_visibilite FROM compte WHERE code = 'instagram:essai'")).rows[0].objectif_visibilite).toMatch(/vues/);
  });
});
