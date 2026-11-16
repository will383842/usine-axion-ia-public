/**
 * U-HORLOGE · lancement hebdomadaire de la proposition : éteint par défaut, arrêté = rien, une seule fois par semaine,
 * route à secret propre (401 sans détail). Tout est simulé : aucun appel réel, aucune base. Données fictives.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { estPublic } from "@/proxy";

const etat = { arret: false, allume: true, verrou: true, envoyees: 2 };
const marques: string[] = [];
const proposer = vi.fn(async (_lundi: string) => ({ message: "ok", proposees: etat.envoyees, envoyees: etat.envoyees, reportees: 0, listeReportees: [] }));
const journaliser = vi.fn(async (_sujet: string, _message: string, options?: { cible?: string }) => {
  if (options?.cible) marques.push(options.cible);
});

vi.mock("@/arret", () => ({ estArrete: async () => etat.arret }));
vi.mock("@/donnees", () => ({ interrupteurAllume: async () => etat.allume, journaliser }));
vi.mock("@/lib/base", () => ({
  requete: async (sql: string, v: unknown[] = []) => (/FROM journal/.test(sql) && marques.includes(String(v[0])) ? [{ n: 1 }] : []),
  pool: () => ({
    connect: async () => ({
      query: async (sql: string) => ({ rows: /try_advisory/.test(sql) ? [{ ok: etat.verrou }] : [] }),
      release: () => {},
    }),
  }),
}));
vi.mock("@/planification", () => ({ proposerLaSemaine: proposer, lundiVise: async () => "2099-03-02" }));

const SECRET = "secret-d-essai-de-l-horloge-0123456789";
const post = (autorisation: string | null = `Bearer ${SECRET}`) =>
  new Request("http://localhost/api/horloge/semaine", { method: "POST", headers: autorisation === null ? {} : { authorization: autorisation } });

beforeEach(() => {
  Object.assign(etat, { arret: false, allume: true, verrou: true, envoyees: 2 });
  marques.length = 0;
  proposer.mockClear();
  journaliser.mockClear();
  process.env.USINE_HORLOGE_SECRET = SECRET;
});

describe("horloge · lancement", () => {
  it("l'interrupteur est éteint par défaut : code horloge.semaine, rien n'est lancé", async () => {
    const { lancerHorloge, INTERRUPTEUR_HORLOGE } = await import("@/planification/horloge");
    expect(INTERRUPTEUR_HORLOGE).toBe("horloge.semaine");
    etat.allume = false;
    expect(await lancerHorloge()).toMatchObject({ lance: false, raison: "eteint" });
    expect(proposer).not.toHaveBeenCalled();
  });

  it("« Tout arrêter » actif : rien n'est lancé", async () => {
    const { lancerHorloge } = await import("@/planification/horloge");
    etat.arret = true;
    expect(await lancerHorloge()).toMatchObject({ lance: false, raison: "arrete" });
    expect(proposer).not.toHaveBeenCalled();
  });

  it("allumée : propose la semaine, et le note au journal", async () => {
    const { lancerHorloge } = await import("@/planification/horloge");
    expect(await lancerHorloge()).toMatchObject({ lance: true, raison: "lance", envoyees: 2 });
    expect(proposer).toHaveBeenCalledWith("2099-03-02");
    expect(journaliser).toHaveBeenCalledWith("horloge", expect.any(String), expect.objectContaining({ cible: "horloge:2099-03-02" }));
  });

  it("deux déclenchements la même semaine : le second ne lance rien (aucun doublon)", async () => {
    const { lancerHorloge } = await import("@/planification/horloge");
    await lancerHorloge();
    expect(marques).toEqual(["horloge:2099-03-02"]);
    expect(await lancerHorloge()).toMatchObject({ lance: false, raison: "deja_fait" });
    expect(proposer).toHaveBeenCalledTimes(1);
  });

  it("verrou déjà pris (déclenchement simultané) : rien n'est lancé", async () => {
    const { lancerHorloge } = await import("@/planification/horloge");
    etat.verrou = false;
    expect(await lancerHorloge()).toMatchObject({ lance: false, raison: "deja_fait" });
    expect(proposer).not.toHaveBeenCalled();
  });

  it("rien n'est parti vers le Studio : lance=false « rien_envoye », la semaine n'est pas marquée faite (nouvel essai possible)", async () => {
    const { lancerHorloge } = await import("@/planification/horloge");
    etat.envoyees = 0;
    expect(await lancerHorloge()).toMatchObject({ lance: false, raison: "rien_envoye", envoyees: 0 });
    expect(journaliser).not.toHaveBeenCalled();
  });
});

describe("horloge · route", () => {
  it("sans secret, mauvais secret ou secret serveur absent : 401 sans détail, rien n'est lancé", async () => {
    const { POST } = await import("@/app/api/horloge/semaine/route");
    for (const r of [post(null), post("Bearer faux"), post("Basic x")]) {
      const rep = await POST(r);
      expect(rep.status).toBe(401);
      expect(await rep.json()).toEqual({ erreur: "Accès refusé." });
    }
    delete process.env.USINE_HORLOGE_SECRET;
    expect((await POST(post())).status).toBe(401);
    expect(proposer).not.toHaveBeenCalled();
  });

  it("secret serveur de moins de 32 caractères : refusé même envoyé tel quel", async () => {
    const { POST } = await import("@/app/api/horloge/semaine/route");
    process.env.USINE_HORLOGE_SECRET = "trop-court";
    expect((await POST(post("Bearer trop-court"))).status).toBe(401);
    expect(proposer).not.toHaveBeenCalled();
  });

  it("le secret de la porte du studio n'ouvre pas l'horloge", async () => {
    const { POST } = await import("@/app/api/horloge/semaine/route");
    process.env.USINE_PORTE_SECRET = "secret-d-essai-de-la-porte-0123456789";
    expect((await POST(post("Bearer secret-d-essai-de-la-porte-0123456789"))).status).toBe(401);
    delete process.env.USINE_PORTE_SECRET;
  });

  it("bon secret : 200, réponse sans aucune donnée de personne", async () => {
    const { POST } = await import("@/app/api/horloge/semaine/route");
    const rep = await POST(post());
    expect(rep.status).toBe(200);
    expect(Object.keys(await rep.json()).sort()).toEqual(["envoyees", "lance", "raison"]);
  });

  it("interrupteur éteint : 200 « eteint », rien n'est lancé ; la route est ouverte au proxy, elle seule", async () => {
    const { POST } = await import("@/app/api/horloge/semaine/route");
    etat.allume = false;
    expect(await (await POST(post())).json()).toMatchObject({ lance: false, raison: "eteint" });
    expect(estPublic("/api/horloge/semaine")).toBe(true);
    for (const x of ["/api/horloge", "/api/horloge/semaine/x", "/api/horloge/semaines"]) expect(estPublic(x)).toBe(false);
  });
});

describe("horloge · serveur", () => {
  const lire = (f: string) => readFileSync(f, "utf8");
  it("la tâche du serveur est éteinte par défaut, sans IA, sans GitHub Actions", () => {
    const sh = lire("deploiement/proposer-semaine.sh");
    expect(sh).toContain("set -euo pipefail");
    expect(sh).toMatch(/HORLOGE_ACTIVE:-0/);
    expect(sh).not.toMatch(/anthropic|claude|openai/i);
    expect(lire("deploiement/crontab")).toMatch(/proposer-semaine\.sh/);
    expect(lire(".env.exemple")).toMatch(/^USINE_HORLOGE_SECRET=$/m);
  });
});
