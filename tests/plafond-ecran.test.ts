/** PLAFOND-USINE-b · écran « Plafond des achats automatiques ». Aucun appel réel : le service d'envoi est une doublure. */
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const exigerSession = vi.fn(async () => undefined);
const interrupteurAllume = vi.fn<(code: string) => Promise<boolean>>(async () => true);
const envoyerPlafondAutomatique = vi.fn();
const envoyerAutonomie = vi.fn();
const couperAutonomie = vi.fn();
vi.mock("@/services/auth", () => ({ exigerSession: () => exigerSession() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/donnees", async (original) => ({ ...((await original()) as object), interrupteurAllume: (c: string) => interrupteurAllume(c) }));
vi.mock("@/reglages/plafond-automatique", async (original) => ({
  ...((await original()) as object),
  envoyerPlafondAutomatique: (...a: unknown[]) => envoyerPlafondAutomatique(...a),
  envoyerAutonomie: (...a: unknown[]) => envoyerAutonomie(...a),
  couperAutonomie: (...a: unknown[]) => couperAutonomie(...a),
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
    envoyerAutonomie.mockReset();
    couperAutonomie.mockReset();
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
        message: "Indiquez un montant entre 0 et 100\u00A0€, avec au plus deux chiffres après la virgule.",
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
    expect(r.message).toMatch(/Le Studio a accepté le plafond/);
    const refus: Array<[unknown, string]> = [
      [{ ok: false, raison: "arret" }, "Tout est arrêté : rien n'a été envoyé."],
      [{ ok: false, raison: "pas_branche" }, "Le lien avec le Studio est éteint : rien n'a été envoyé."],
      [{ ok: false, raison: "sans_reponse" }, "Le Studio ne répond pas : rien n'a changé. Réessayez plus tard."],
      [{ ok: false, raison: "refuse", statut: 429 }, "Le Studio a refusé l'envoi : rien n'a changé. Le détail est dans le journal."],
      [
        { ok: false, raison: "reponse_inattendue", statut: 200 },
        "Le Studio a répondu de façon inattendue : ce réglage n'est pas noté comme accepté. Le détail est dans le journal.",
      ],
      [{ ok: false, raison: "hors_bornes" }, "Indiquez un montant entre 0 et 100\u00A0€, avec au plus deux chiffres après la virgule."],
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

describe("plafond-ecran · allumer et éteindre", () => {
  beforeEach(() => {
    exigerSession.mockReset();
    exigerSession.mockResolvedValue(undefined);
    interrupteurAllume.mockReset();
    interrupteurAllume.mockResolvedValue(true);
    envoyerAutonomie.mockReset();
    couperAutonomie.mockReset();
  });
  const ok = { ok: true, actif: true, plafond_cents: 2000, deja: false };

  it("allumer sans confirmation « allumer » : refusé, aucun appel", async () => {
    const { allumerAutonomie } = await import("@/app/reglages/plafond/actions");
    for (const c of [undefined, "", "oui", "Allumer", "allumer "]) {
      const r = await allumerAutonomie("20", c as unknown as string);
      expect(r.ok, String(c)).toBe(false);
    }
    expect(envoyerAutonomie).not.toHaveBeenCalled();
  });

  it("allumer : session et écran exigés ; au-dessus de 100 € ou à 0 : refusé sans appel", async () => {
    const { allumerAutonomie } = await import("@/app/reglages/plafond/actions");
    exigerSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(allumerAutonomie("20", "allumer")).rejects.toThrow();
    interrupteurAllume.mockResolvedValueOnce(false);
    expect(await allumerAutonomie("20", "allumer")).toEqual({ ok: false, message: "Cet écran est éteint." });
    for (const s of ["0", "0,00", "100,01", "101", "abc", "", "1 0"]) expect((await allumerAutonomie(s, "allumer")).ok, s).toBe(false);
    expect(envoyerAutonomie).not.toHaveBeenCalled();
  });

  it("allumer avec confirmation : envoie « allumé » et le plafond en centimes entiers", async () => {
    const { allumerAutonomie } = await import("@/app/reglages/plafond/actions");
    envoyerAutonomie.mockResolvedValue(ok);
    const r = await allumerAutonomie("20", "allumer");
    expect(envoyerAutonomie).toHaveBeenCalledWith({ actif: true, plafondCents: 2000 });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/allumée/);
    envoyerAutonomie.mockResolvedValue({ ok: true, actif: true, plafond_cents: 10000, deja: false });
    await allumerAutonomie("100", "allumer");
    expect(envoyerAutonomie).toHaveBeenLastCalledWith({ actif: true, plafondCents: 10000 });
  });

  it("allumer : le Studio se tait ou refuse → message clair, rien n'a changé", async () => {
    const { allumerAutonomie } = await import("@/app/reglages/plafond/actions");
    envoyerAutonomie.mockResolvedValue({ ok: false, raison: "sans_reponse" });
    expect(await allumerAutonomie("20", "allumer")).toEqual({ ok: false, message: "Le Studio ne répond pas : rien n'a changé. Réessayez plus tard." });
    envoyerAutonomie.mockRejectedValue(new Error("panne"));
    expect((await allumerAutonomie("20", "allumer")).ok).toBe(false);
  });

  it("éteindre : immédiat, sans confirmation ; Studio muet : message clair", async () => {
    const { eteindreAutonomie } = await import("@/app/reglages/plafond/actions");
    couperAutonomie.mockResolvedValue({ ok: true, actif: false, plafond_cents: 2000, deja: false });
    const r = await eteindreAutonomie();
    expect(couperAutonomie).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/éteinte/);
    couperAutonomie.mockResolvedValue({ ok: false, raison: "sans_reponse" });
    expect(await eteindreAutonomie()).toEqual({ ok: false, message: "Le Studio ne répond pas : rien n'a changé. L'autonomie peut encore être allumée ; éteignez-la aussi dans le Studio." });
  });
});

describe("plafond-ecran · textes de l'écran", () => {
  const dossier = "src/app/reglages/plafond";
  const sources = () => readdirSync(dossier).map((f) => readFileSync(join(dossier, f), "utf8"));
  it("l'écran montre les 4 blocs : interrupteur, plafond, dépensé ce mois-ci, plafonds par vidéo", () => {
    const tout = sources().join("\n");
    expect(tout).toContain("Ce que l&apos;Usine dépense seule");
    expect(tout).toContain('role="switch"');
    expect(tout).toContain("Plafond du mois, en euros");
    expect(tout).toContain("Dépensé ce mois-ci");
    expect(tout).toContain("LIGNES_PLAFONDS_VIDEO");
    expect(tout).toContain("Oui, allumer");
    expect(tout).toContain("Le Studio ne répond pas");
  });
  it("l'effet de « Tout arrêter » est dit à l'écran ; « Éteindre maintenant » reste proposé quand l'état n'est pas lu ; le formulaire n'est pas remonté par une clé d'état", () => {
    const page = readFileSync(join(dossier, "page.tsx"), "utf8");
    expect(page).toMatch(/« Tout arrêter » éteint aussi ce que l&apos;Usine dépense seule ; la reprise ne le rallume jamais, seul cet écran le peut/);
    expect(page).toMatch(/\{studio\.connu \? \([\s\S]*?\) : \([\s\S]*?Éteindre maintenant/);
    expect(page).not.toMatch(/<FormulairePlafond[^>]*\bkey=/);
    const bouton = readFileSync("src/arret/BoutonToutArreter.tsx", "utf8");
    expect(bouton).toMatch(/éteint aussi ce que l&apos;Usine dépense seule/);
    expect(bouton).toMatch(/seul l&apos;écran « Ce que l&apos;Usine dépense seule » peut le rallumer/);
  });
  it("ne dit plus « restent éteints » ni « Vous seul pourrez les allumer »", () => {
    const tout = sources().join("\n");
    expect(tout).not.toContain("restent éteints");
    expect(tout).not.toContain("Vous seul pourrez les allumer");
    expect(tout).toContain("ne se règle plus dans le Studio");
  });
  it("aucun mot interdit, aucun montant écrit en dur", () => {
    const tout = sources().join("\n");
    expect(tout).not.toMatch(/\b(CRM|lead|batch|job|prompt|token|workflow|persona|pipeline|aimant|séquence|likez|Grenoble|Buffer)\b/i);
    expect(tout.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\d+\s?€/); // hors commentaires (la citation de l'ordre du fondateur en contient un)
  });
  it("la page lit l'interrupteur plafond.ecran et exige la session", () => {
    const page = readFileSync(join(dossier, "page.tsx"), "utf8");
    expect(page).toContain('"plafond.ecran"');
    expect(page).toMatch(/await exigerSession\(\);/);
  });
});
