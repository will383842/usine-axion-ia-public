/**
 * T09 · Commander un lot : plafond ; refus appliqué au tirage suivant ; un lot ne contient que des métiers allumés.
 * Données fictives. Les essais de base exigent DATABASE_URL (PostgreSQL 16) ; sans elle, ils sont sautés.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schemaCommande, verifierPlafond } from "@/lots/regles";

const SERVICES = ["formation", "audit", "coaching", "integration"];
const FAMILLES = ["scène vécue", "constat partagé", "contre-pied", "énumération", "idée reçue corrigée"];

function commande(autres: Record<string, unknown> = {}) {
  return {
    nombre: "5",
    plafondEur: "40",
    coutMaxLigneEur: "2",
    reseaux: ["instagram", "facebook"],
    poidsTailles: { TPE: 25, PME: 25, ETI: 25, GE: 25 },
    poidsServices: { formation: 25, audit: 25, coaching: 25, integration: 25 },
    rythmeActualites: 0,
    ...autres,
  };
}

describe("lots · plafond", () => {
  it("un lot sans plafond est refusé", () => {
    for (const plafondEur of [undefined, "", "0", "-3"]) expect(schemaCommande.safeParse(commande({ plafondEur })).success).toBe(false);
    expect(verifierPlafond(5, 2, null)).toMatch(/plafond/);
  });

  it("un lot dont le cumul des coûts maximum dépasse le plafond est refusé", () => {
    expect(verifierPlafond(5, 2, 9.99)).toMatch(/au-dessus du plafond/);
    expect(verifierPlafond(5, 2, 10)).toBeNull();
    expect(verifierPlafond(3, 0.1, 0.3)).toBeNull();
    const r = schemaCommande.safeParse(commande({ nombre: "30", plafondEur: "40" }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/20 contenus au plus/);
    expect(schemaCommande.safeParse(commande()).success).toBe(true);
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("lots · en base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
    await p.query("UPDATE interrupteur SET allume = true WHERE code IN ('lots', 'tirage')");
    await p.query("INSERT INTO secteur (code, nom) VALUES ('essai', 'Essai')");
    for (const [i, s] of SERVICES.entries()) await p.query("INSERT INTO service (code, nom, ordre) VALUES ($1, $1, $2) ON CONFLICT (code) DO NOTHING", [s, i]);
    for (const [code, allume] of [["essai.un", true], ["essai.deux", true], ["essai.eteint", false]] as const) {
      await p.query("INSERT INTO metier (code, secteur, nom, allume, etat) VALUES ($1, 'essai', $1, $2, 'valide')", [code, allume]);
      for (const s of SERVICES) {
        await p.query("INSERT INTO douleur (code, cible, services, etat) VALUES ($1, $2, $3, 'valide')", [`${code}.d${SERVICES.indexOf(s) + 1}`, code, s]);
        for (const k of [1, 2]) await p.query("INSERT INTO cas_usage (code, cible, service, etat) VALUES ($1, $2, $3, 'valide')", [`${code}.${s}.c0${k}`, code, s]);
      }
    }
    for (const t of ["TPE", "PME", "ETI", "GE"]) await p.query("INSERT INTO taille (code, poids, actif) VALUES ($1, '1', 'oui')", [t]);
    for (const [i, f] of FAMILLES.entries()) await p.query("INSERT INTO accroche (code, famille, types_contenu, etat) VALUES ($1, $2, 'video', 'valide')", [`accroche.essai-${i}`, f]);
    await p.query("INSERT INTO format_video (code, statut, en_lot, etat) VALUES ('tableau-anime', 'actif', 'oui', 'valide')");
    await p.query(
      "INSERT INTO appel (code, reseaux, cible, type_contenu, type, objectif, dit, etat) VALUES ('fin-if-question', 'instagram ; facebook', 'clients', 'video', 'question', 'QUESTION', 'Et chez vous ?', 'valide')",
    );
  });

  afterAll(async () => {
    await p?.end();
  });

  const lots = () => import("@/lots");

  it("plafond : refusé avant le tirage, à la commande et par la base", async () => {
    const { tirerApercu, commanderLot, ErreurLot } = await lots();
    const valide = schemaCommande.parse(commande());
    await expect(tirerApercu({ ...valide, coutMaxLigneEur: 9 })).rejects.toThrow(ErreurLot);
    await expect(tirerApercu({ ...valide, plafondEur: undefined as unknown as number })).rejects.toThrow(/plafond/);
    // Plafond abaissé après l'aperçu : la commande est refusée et rien n'est écrit.
    const id = await tirerApercu(schemaCommande.parse(commande()));
    await p.query("UPDATE lot SET plafond_eur = 3 WHERE id = $1", [id]);
    await expect(commanderLot(id)).rejects.toThrow(/au-dessus du plafond/);
    expect((await p.query("SELECT count(*)::int AS n FROM lot_ligne WHERE lot = $1", [id])).rows[0].n).toBe(0);
    // La base refuse elle aussi une ligne qui ferait dépasser le plafond.
    await p.query("INSERT INTO lot (id, numero, nombre, plafond_eur, etat) VALUES ('L900', 900, 3, 5, 'commande')");
    const ligne = (rang: number) =>
      p.query("INSERT INTO lot_ligne (id, lot, rang, type_contenu, repere, cout_max_eur) VALUES ($1, 'L900', $2, 'video', $3, 2)", [`L900-${rang}`, rang, `usine:L900-${rang}`]);
    await ligne(1);
    await ligne(2);
    await expect(ligne(3)).rejects.toThrow(/plafond_depasse/);
    await expect(p.query("UPDATE lot SET plafond_eur = 3 WHERE id = 'L900'")).rejects.toThrow(/plafond_depasse/);
  });

  it("un lot ne contient que des métiers allumés", async () => {
    const { tirerApercu, commanderLot, lireLot } = await lots();
    for (let k = 0; k < 4; k++) {
      const lu = await lireLot(await tirerApercu(schemaCommande.parse(commande())));
      expect(lu!.reglages.apercu!.lignes.length).toBeGreaterThan(0);
      expect(lu!.reglages.apercu!.lignes.every((l) => l.metier === "essai.un" || l.metier === "essai.deux")).toBe(true);
    }
    // Un métier éteint entre l'aperçu et la commande : la commande est refusée.
    const id = await tirerApercu(schemaCommande.parse(commande({ nombre: "3", metiers: ["essai.deux"] })));
    await p.query("UPDATE metier SET allume = false WHERE code = 'essai.deux'");
    await expect(commanderLot(id)).rejects.toThrow(/métier éteint/);
    await p.query("UPDATE metier SET allume = true WHERE code = 'essai.deux'");
  });

  it("un refus est appliqué au tirage suivant", async () => {
    const { tirerApercu, commanderLot, changerLigne, lireLot } = await lots();
    const id = await tirerApercu(schemaCommande.parse(commande({ nombre: "3" })));
    await commanderLot(id);
    const { lignes } = (await lireLot(id))!;
    expect(lignes).toHaveLength(3);
    expect(lignes.every((l) => l.signature && l.repere === `usine:${l.id}`)).toBe(true);
    const refusee = lignes[0];
    await changerLigne(refusee.id, { etat: "refusee", refus: "faux_ou_douteux", codeVersion: null });
    for (let k = 0; k < 5; k++) {
      const apres = (await lireLot(await tirerApercu(schemaCommande.parse(commande({ nombre: "8" })))))!.reglages.apercu!.lignes;
      expect(apres.length).toBeGreaterThan(0);
      expect(apres.map((l) => l.cas_usage)).not.toContain(refusee.cas_usage);
      expect(apres.map((l) => l.signature).filter((s) => lignes.some((l) => l.signature === s))).toEqual([]);
    }
  });

  it("un déjà fabriqué saisi par sujet, noté pendant l'aperçu, refuse la commande (relecture T09, point 1)", async () => {
    const { tirerApercu, commanderLot, ajouterDejaFabrique, lireLot } = await lots();
    await p.query("INSERT INTO famille (code, nom) VALUES ('A', 'Essai') ON CONFLICT (code) DO NOTHING");
    await p.query("INSERT INTO sujet (code, famille, titre) VALUES ('a.essai', 'A', 'Essai')");
    await p.query("UPDATE cas_usage SET sujet = 'a.essai' WHERE cible IN ('essai.un', 'essai.deux')");
    const id = await tirerApercu(schemaCommande.parse(commande({ nombre: "4", metiers: ["essai.un", "essai.deux"] })));
    expect((await lireLot(id))!.reglages.apercu!.lignes.length).toBeGreaterThan(0);
    for (const metier of ["essai.un", "essai.deux"]) {
      await ajouterDejaFabrique({
        type_contenu: "video", metier, taille: null, service: null, cas_usage: null, sujet: "a.essai",
        format: "tableau-anime", structure: null, code_version: null, fabrique_le: null, note: null,
      });
    }
    await expect(commanderLot(id)).rejects.toThrow(/déjà commandé ou déjà fabriqué/);
    expect((await p.query("SELECT count(*)::int AS n FROM lot_ligne WHERE lot = $1", [id])).rows[0].n).toBe(0);
  });
});
