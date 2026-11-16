/** PLAFOND-USINE-b · écran « Plafond des achats automatiques ». Aucun appel réel : le service d'envoi est une doublure. */
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const exigerSession = vi.fn(async () => undefined);
const interrupteurAllume = vi.fn<(code: string) => Promise<boolean>>(async () => true);
const envoyerPlafondAutomatique = vi.fn();
vi.mock("@/services/auth", () => ({ exigerSession: () => exigerSession() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/donnees", async (original) => ({ ...((await original()) as object), interrupteurAllume: (c: string) => interrupteurAllume(c) }));
vi.mock("@/reglages/plafond-automatique", async (original) => ({
  ...((await original()) as object),
  envoyerPlafondAutomatique: (...a: unknown[]) => envoyerPlafondAutomatique(...a),
}));

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;

describe.skipIf(!url)("plafond-ecran · migration", () => {
  let p: Pool;
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

  it("ajoute plafond.ecran ÉTEINT ; rejouée, elle ne réécrit pas l'état posé par le fondateur", async () => {
    const lire = async () => (await p.query("SELECT allume FROM interrupteur WHERE code = 'plafond.ecran'")).rows;
    expect(await lire()).toEqual([{ allume: false }]);
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'plafond.ecran'");
    const sql = readdirSync("migrations").find((f) => /interrupteur-plafond/.test(f));
    expect(sql).toBeDefined();
    await p.query(readFileSync(join("migrations", sql!), "utf8"));
    expect(await lire()).toEqual([{ allume: true }]);
    // Aucune ligne d'interrupteur d'autonomie.
    const autonomie = await p.query("SELECT code FROM interrupteur WHERE code LIKE 'autonomie%' OR code LIKE 'usine.autonomie%'");
    expect(autonomie.rows).toEqual([]);
  });
});

describe("plafond-ecran · action serveur", () => {
  beforeEach(() => {
    exigerSession.mockReset();
    exigerSession.mockResolvedValue(undefined);
    interrupteurAllume.mockReset();
    interrupteurAllume.mockResolvedValue(true);
    envoyerPlafondAutomatique.mockReset();
  });

  it("sans session : rejette, rien n'est envoyé", async () => {
    exigerSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const { enregistrerPlafondAutomatique } = await import("@/app/reglages/plafond/actions");
    await expect(enregistrerPlafondAutomatique("20")).rejects.toThrow();
    expect(envoyerPlafondAutomatique).not.toHaveBeenCalled();
  });

  it("écran éteint : refus, rien n'est envoyé", async () => {
    interrupteurAllume.mockResolvedValue(false);
    const { enregistrerPlafondAutomatique } = await import("@/app/reglages/plafond/actions");
    expect(await enregistrerPlafondAutomatique("20")).toEqual({ ok: false, message: "Cet écran est éteint." });
    expect(interrupteurAllume).toHaveBeenCalledWith("plafond.ecran");
    expect(envoyerPlafondAutomatique).not.toHaveBeenCalled();
  });

  it("saisie refusée : message de bornes, rien n'est envoyé", async () => {
    const { enregistrerPlafondAutomatique } = await import("@/app/reglages/plafond/actions");
    for (const s of ["", "-1", "100,01", "abc", "1e2", "20,555", "1000", "1 0", "1\u00a00", " 1 0 "]) {
      expect(await enregistrerPlafondAutomatique(s), s).toEqual({
        ok: false,
        message: "Indiquez un montant entre 0 et 100 €, avec au plus deux chiffres après la virgule.",
      });
    }
    expect(envoyerPlafondAutomatique).not.toHaveBeenCalled();
  });

  it("envoie des centimes entiers et rend les messages en clair", async () => {
    const { enregistrerPlafondAutomatique } = await import("@/app/reglages/plafond/actions");
    envoyerPlafondAutomatique.mockResolvedValue({ ok: true, plafond_cents: 2050, deja: false });
    const r = await enregistrerPlafondAutomatique("20,5");
    expect(envoyerPlafondAutomatique).toHaveBeenCalledWith(2050);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/restent éteints/);
    const refus: Array<[unknown, string]> = [
      [{ ok: false, raison: "arret" }, "Tout est arrêté : rien n'a été envoyé."],
      [{ ok: false, raison: "pas_branche" }, "Le lien avec le Studio est éteint : rien n'a été envoyé."],
      [{ ok: false, raison: "sans_reponse" }, "Le Studio ne répond pas : le plafond n'a pas changé. Réessayez plus tard."],
      [{ ok: false, raison: "refuse", statut: 429 }, "Le Studio a refusé l'envoi : le plafond n'a pas changé. Le détail est dans le journal."],
      [
        { ok: false, raison: "reponse_inattendue", statut: 200 },
        "Le Studio a répondu de façon inattendue : le plafond n'est pas noté comme accepté. Le détail est dans le journal.",
      ],
      [{ ok: false, raison: "hors_bornes" }, "Indiquez un montant entre 0 et 100 €, avec au plus deux chiffres après la virgule."],
    ];
    for (const [resultat, message] of refus) {
      envoyerPlafondAutomatique.mockResolvedValue(resultat);
      expect(await enregistrerPlafondAutomatique("20")).toEqual({ ok: false, message });
    }
    envoyerPlafondAutomatique.mockRejectedValue(new Error("panne"));
    const panne = await enregistrerPlafondAutomatique("20");
    expect(panne.ok).toBe(false);
  });
});

describe("plafond-ecran · textes de l'écran", () => {
  const dossier = "src/app/reglages/plafond";
  const sources = () => readdirSync(dossier).map((f) => readFileSync(join(dossier, f), "utf8"));
  it("dit « éteints » et « Vous seul pourrez les allumer », sans geste pour allumer", () => {
    const tout = sources().join("\n");
    expect(tout).toContain("éteints");
    expect(tout).toContain("Vous seul pourrez les allumer");
    for (const interdit of ['role="switch"', 'type="checkbox"', "BoutonInterrupteur", "Allumer", "allumerEcran", "EcranEteint"]) expect(tout, interdit).not.toContain(interdit);
  });
  it("aucun mot interdit, aucun montant écrit en dur", () => {
    const tout = sources().join("\n");
    expect(tout).not.toMatch(/\b(CRM|lead|batch|job|prompt|token|workflow|persona|pipeline|aimant|séquence|likez|Grenoble|Buffer)\b/i);
    expect(tout).not.toMatch(/\d+\s?€/);
  });
  it("dit avant l'envoi que le premier envoi accepté bascule le Studio à sens unique", () => {
    const page = readFileSync(join(dossier, "page.tsx"), "utf8");
    expect(page).toContain("au premier envoi accepté");
    expect(page).toContain("à sens unique");
    expect(page).toContain("piloté par l&apos;Usine");
    expect(page).toContain("L&apos;Usine en automatique");
    expect(page).toContain("devient sans effet");
    expect(page.indexOf("à sens unique")).toBeLessThan(page.indexOf("<FormulairePlafond"));
  });
  it("la page lit l'interrupteur plafond.ecran et exige la session", () => {
    const page = readFileSync(join(dossier, "page.tsx"), "utf8");
    expect(page).toContain('"plafond.ecran"');
    expect(page).toMatch(/await exigerSession\(\);/);
  });
});
