/** PLAFOND-USINE-a · envoi du plafond des achats automatiques au Studio. Aucun appel réel : la passerelle est une doublure. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const reglerPlafondDuStudio = vi.fn();
const lireAutonomieDuStudio = vi.fn();
let reelle: (a: boolean, c: number) => Promise<unknown>;
vi.mock("@/passerelles/studio", async (original) => {
  const vrai = (await original()) as { reglerPlafondDuStudio: (a: boolean, c: number) => Promise<unknown> };
  return { ...vrai, __reelle: vrai.reglerPlafondDuStudio, reglerPlafondDuStudio: (...a: unknown[]) => reglerPlafondDuStudio(...a), lireAutonomieDuStudio: () => lireAutonomieDuStudio() };
});

import { lireSaisieEuros } from "@/reglages/plafond-automatique";
import { PLAFOND_AUTO_MAX_CENTS, corpsPlafondStudio, reponsePlafondStudio, reponseAutonomieStudio } from "@/contrats";

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
    reelle = ((await import("@/passerelles/studio")) as unknown as { __reelle: (a: boolean, c: number) => Promise<unknown> }).__reelle;
  });
  afterAll(async () => {
    await p?.end();
  });
  beforeEach(async () => {
    reglerPlafondDuStudio.mockReset();
    lireAutonomieDuStudio.mockReset();
    reglerPlafondDuStudio.mockResolvedValue(reponse());
    lireAutonomieDuStudio.mockResolvedValue({ envoye: false });
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
    expect(r).toEqual({ ok: true, actif: false, plafond_cents: 2000, deja: false });
    expect(reglerPlafondDuStudio).toHaveBeenCalledTimes(1);
    expect(reglerPlafondDuStudio).toHaveBeenCalledWith(false, 2000);
    expect(await brut()).toEqual({ actif: false, plafond_cents: 2000, accepte_le: expect.any(String), version: 2 });
    expect((await lirePlafondAutomatique())?.plafond_cents).toBe(2000);
    const j = await journal();
    expect(j).toHaveLength(1);
    expect(j[0].sujet).toBe("reglage");
    expect(j[0].message).toMatch(/acceptée par le Studio/);
    expect(j[0].message).toMatch(/éteinte/);
    expect(j[0].donnees).toMatchObject({ avant: null, apres: { actif: false, plafond_cents: 2000 } });
  });

  it("allumer : envoyé et noté seulement si l'état et le plafond reçus sont exactement ceux envoyés ; journal avant et après", async () => {
    const { envoyerAutonomie, lirePlafondAutomatique } = await import("@/reglages/plafond-automatique");
    reglerPlafondDuStudio.mockResolvedValue(reponse({ automatique: true }));
    expect(await envoyerAutonomie({ actif: true, plafondCents: 2000 })).toEqual({ ok: true, actif: true, plafond_cents: 2000, deja: false });
    expect(reglerPlafondDuStudio).toHaveBeenCalledWith(true, 2000);
    expect(await brut()).toEqual({ actif: true, plafond_cents: 2000, accepte_le: expect.any(String), version: 2 });
    expect((await lirePlafondAutomatique())?.actif).toBe(true);
    const j = await journal();
    expect(j[0].message).toMatch(/allumée/);
    expect(j[0].donnees).toMatchObject({ avant: null, apres: { actif: true, plafond_cents: 2000 } });
    // éteindre ensuite : l'avant est l'état allumé
    reglerPlafondDuStudio.mockResolvedValue(reponse());
    await reperer();
    await envoyerAutonomie({ actif: false, plafondCents: 2000 });
    expect((await journal())[0].donnees).toMatchObject({ avant: { actif: true, plafond_cents: 2000 }, apres: { actif: false } });
  });

  it("allumer à 0 ou au-dessus de la borne : refusé sans aucun appel", async () => {
    const { envoyerAutonomie } = await import("@/reglages/plafond-automatique");
    for (const c of [0, 10001, -5]) expect(await envoyerAutonomie({ actif: true, plafondCents: c })).toMatchObject({ ok: false, raison: "hors_bornes" });
    expect(reglerPlafondDuStudio).not.toHaveBeenCalled();
  });

  it("l'état reçu diffère de l'envoi : rien n'est écrit, alerte au journal", async () => {
    const { envoyerAutonomie } = await import("@/reglages/plafond-automatique");
    reglerPlafondDuStudio.mockResolvedValue(reponse({ automatique: false })); // allumer demandé, éteint reçu
    expect(await envoyerAutonomie({ actif: true, plafondCents: 2000 })).toMatchObject({ ok: false, raison: "reponse_inattendue" });
    expect(await brut()).toEqual({});
    expect((await journal()).some((l) => /^Alerte/.test(l.message))).toBe(true);
  });

  it("l'ancien réglage (version 1) se lit comme éteint", async () => {
    const { ecrireReglage } = await import("@/donnees");
    const { lirePlafondAutomatique } = await import("@/reglages/plafond-automatique");
    await ecrireReglage(CLE, { plafond_cents: 1500, accepte_le: "2026-11-01T10:00:00.000Z", version: 1 });
    expect(await lirePlafondAutomatique()).toMatchObject({ actif: false, plafond_cents: 1500 });
  });

  it("couperAutonomie : envoie « éteint » même sous arrêt ; Studio muet : journal, pas d'exception", async () => {
    const { couperAutonomie } = await import("@/reglages/plafond-automatique");
    await arret(true);
    reglerPlafondDuStudio.mockResolvedValue(reponse({ plafond_automatique_cents: 0 })); // rien lu ni noté : plafond 0
    expect(await couperAutonomie()).toMatchObject({ ok: true, actif: false });
    expect(reglerPlafondDuStudio).toHaveBeenCalledWith(false, expect.any(Number));
    reglerPlafondDuStudio.mockRejectedValue(new Error("réseau"));
    await reperer();
    expect(await couperAutonomie()).toMatchObject({ ok: false, raison: "sans_reponse" });
    expect((await journal()).length).toBeGreaterThan(0);
    await arret(false);
  });

  it("lireAutonomieStudio : lecture conforme, ou « inconnu » en cas de panne ou de réponse illisible", async () => {
    const { lireAutonomieStudio } = await import("@/reglages/plafond-automatique");
    lireAutonomieDuStudio.mockResolvedValue({ envoye: true, statut: 200, corps: { automatique: true, plafond_automatique_cents: 2000, utilise_automatique_cents: 350, mois: "2026-11", pilote: "usine", extra: 1 } });
    expect(await lireAutonomieStudio()).toEqual({ connu: true, automatique: true, plafond_cents: 2000, utilise_cents: 350, mois: "2026-11", pilote: "usine" });
    lireAutonomieDuStudio.mockRejectedValue(new Error("réseau"));
    expect(await lireAutonomieStudio()).toEqual({ connu: false });
    lireAutonomieDuStudio.mockResolvedValue({ envoye: true, statut: 500, corps: null });
    expect(await lireAutonomieStudio()).toEqual({ connu: false });
    lireAutonomieDuStudio.mockResolvedValue({ envoye: false });
    expect(await lireAutonomieStudio()).toEqual({ connu: false });
    lireAutonomieDuStudio.mockResolvedValue({ envoye: true, statut: 200, corps: { automatique: true } });
    expect(await lireAutonomieStudio()).toEqual({ connu: false });
  });

  it("lireAutonomieStudio : la lecture reste possible sous « Tout arrêter » (elle ne dit pas à tort que le Studio se tait)", async () => {
    const { lireAutonomieStudio } = await import("@/reglages/plafond-automatique");
    lireAutonomieDuStudio.mockReset();
    lireAutonomieDuStudio.mockResolvedValue({ envoye: true, statut: 200, corps: { automatique: true, plafond_automatique_cents: 2000, utilise_automatique_cents: 0, mois: "2026-11", pilote: "usine" } });
    await arret(true);
    try {
      expect(await lireAutonomieStudio()).toMatchObject({ connu: true, automatique: true });
      expect(lireAutonomieDuStudio).toHaveBeenCalledTimes(1);
    } finally {
      await arret(false);
    }
  });

  it("rejeu (deja) : ok, valeur inchangée", async () => {
    const { envoyerPlafondAutomatique } = await import("@/reglages/plafond-automatique");
    await envoyerPlafondAutomatique(2000);
    const avantRejeu = await brut();
    reglerPlafondDuStudio.mockResolvedValue(reponse({ deja: true }));
    expect(await envoyerPlafondAutomatique(2000)).toEqual({ ok: true, actif: false, plafond_cents: 2000, deja: true });
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
    expect(await reelle(false, 2000)).toEqual({ envoye: false });
    expect(await reelle(true, 2000)).toEqual({ envoye: false });
    await expect(reelle(false, 10001)).rejects.toThrow();
    await expect(reelle(false, -1)).rejects.toThrow();
    await expect(reelle(false, 1.5)).rejects.toThrow();
    await expect(reelle(true, 0)).rejects.toThrow();
  });
});

describe("plafond automatique · garde-fous statiques", () => {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier).flatMap((n) => {
      const c = join(dossier, n);
      return statSync(c).isDirectory() ? fichiers(c) : [c];
    });
  /* Ordre écrit du fondateur du 25/11 (« oui sur l'autonomie de l'usine », 20 € modifiables dans la console) : seul `allumerAutonomie`, après `confirmation === "allumer"`, peut produire l'état allumé. */
  it("aucun littéral « automatique: true » dans src/ ; « actif: true » seulement dans allumerAutonomie, après la confirmation", () => {
    let trouves = 0;
    for (const f of fichiers("src").filter((x) => /\.(ts|tsx)$/.test(x))) {
      const t = readFileSync(f, "utf8");
      expect(t, f).not.toMatch(/automatique\s*:\s*(true|!)/);
      const n = t.match(/envoyerAutonomie\(\{\s*actif\s*:\s*true/g)?.length ?? 0;
      if (n > 0) {
        expect(f.replace(/\\/g, "/")).toBe("src/app/reglages/plafond/actions.ts");
        trouves += n;
        const corps = t.slice(t.indexOf("export async function allumerAutonomie"));
        expect(corps.indexOf('confirmation !== "allumer"')).toBeGreaterThan(-1);
        expect(corps.indexOf('confirmation !== "allumer"')).toBeLessThan(corps.search(/actif\s*:\s*true/));
      }
    }
    expect(trouves).toBe(1);
  });
  it("l'envoi vers le Studio n'a que deux appelants : `reglerPlafondDuStudio(` dans plafond-automatique.ts seul ; `envoyerAutonomie(` seulement avec `actif: true` (actions.ts) ou `actif: false`, jamais une variable", () => {
    const enleverCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const f of fichiers("src").filter((x) => /\.(ts|tsx)$/.test(x))) {
      const chemin = f.replace(/\\/g, "/");
      const t = enleverCommentaires(readFileSync(f, "utf8")).replace(/^import [^;]*;$/gm, "");
      const appelsPasserelle = (t.match(/\breglerPlafondDuStudio\b/g) ?? []).length;
      if (chemin === "src/passerelles/studio.ts") expect(appelsPasserelle, chemin).toBe(1); // sa définition
      else if (chemin === "src/reglages/plafond-automatique.ts") expect(appelsPasserelle, chemin).toBe(1); // un seul appel (l'import est écarté)
      else expect(appelsPasserelle, chemin).toBe(0);
      if (chemin === "src/reglages/plafond-automatique.ts") continue; // sa définition et ses propres appels (`actif: false` écrit en dur)
      for (const m of t.matchAll(/\benvoyerAutonomie\b(?!\s*\()/g)) expect.soft(m[0], `${chemin} : envoyerAutonomie ne se passe ni ne s'alias jamais`).toBeUndefined();
      for (const m of t.matchAll(/\benvoyerAutonomie\(([^)]*)/g)) {
        expect(m[1], `${chemin} : envoyerAutonomie( n'accepte qu'un littéral actif: true|false`).toMatch(/^\s*\{\s*actif\s*:\s*(true|false)\s*,/);
        if (/actif\s*:\s*true/.test(m[1])) expect(chemin).toBe("src/app/reglages/plafond/actions.ts");
      }
    }
    const plafond = enleverCommentaires(readFileSync("src/reglages/plafond-automatique.ts", "utf8"));
    for (const m of plafond.matchAll(/\benvoyerAutonomie\(\s*\{\s*(actif\s*:[^}]*)\}/g)) expect(m[1], "plafond-automatique.ts").toMatch(/^actif\s*:\s*false\b/);
    // Le seul appel de la passerelle y passe l'état reçu en paramètre de envoyerAutonomie.
    expect(plafond).toMatch(/reglerPlafondDuStudio\(actif, plafondCents\)/);
  });
  it("chaque appel réseau de la passerelle du Studio a un délai maximal", () => {
    const t = readFileSync("src/passerelles/studio.ts", "utf8");
    const appels = t.match(/await fetch\(/g)?.length ?? 0;
    expect(appels).toBeGreaterThan(0);
    expect(t.match(/signal: AbortSignal\.timeout\(DELAI_MAX_MS\)/g)?.length ?? 0).toBe(appels);
    expect(t).toMatch(/DELAI_MAX_MS = 10_000/);
  });
  it("la passerelle prend l'état en paramètre, sans littéral, et envoie en PUT", () => {
    const t = readFileSync("src/passerelles/studio.ts", "utf8");
    expect(t).not.toMatch(/automatique:\s*(true|false)/);
    expect(t).toMatch(/function reglerPlafondDuStudio\(automatique: boolean, plafondCents: number\)/);
    expect(t).toMatch(/method: "PUT"/);
    expect(t).toMatch(/\/api\/usine\/reglages\/autonomie/);
  });
  it("le contrat refuse « allumé » avec 0, à l'envoi comme à la réception", () => {
    expect(corpsPlafondStudio.safeParse({ contrat: 2, automatique: true, plafond_automatique_cents: 0 }).success).toBe(false);
    expect(corpsPlafondStudio.safeParse({ contrat: 2, automatique: true, plafond_automatique_cents: 2000 }).success).toBe(true);
    expect(corpsPlafondStudio.safeParse({ contrat: 2, automatique: false, plafond_automatique_cents: 0 }).success).toBe(true);
    expect(corpsPlafondStudio.safeParse({ contrat: 2, automatique: true, plafond_automatique_cents: 10001 }).success).toBe(false);
    expect(reponsePlafondStudio.safeParse({ automatique: true, plafond_automatique_cents: 0, deja: false }).success).toBe(false);
    expect(reponsePlafondStudio.safeParse({ automatique: true, plafond_automatique_cents: 2000, deja: false }).success).toBe(true);
    expect(reponseAutonomieStudio.safeParse({ automatique: false, plafond_automatique_cents: 0, utilise_automatique_cents: 0, mois: "2026-11", pilote: "aucun" }).success).toBe(true);
    expect(reponseAutonomieStudio.safeParse({ automatique: false, plafond_automatique_cents: 0, utilise_automatique_cents: 0, mois: "2026-11", pilote: "autre" }).success).toBe(false);
  });
  it("aucune migration ne crée d'interrupteur d'autonomie", () => {
    for (const f of readdirSync("migrations")) {
      const sql = readFileSync(join("migrations", f), "utf8");
      expect(sql, f).not.toMatch(/'(usine\.)?autonomie/i);
    }
  });
});
