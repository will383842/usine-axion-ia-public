/** U-VEILLE · alertes de silence calculées (horloge fixée, données fictives, aucun appel). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alertesDeVeille, cartesDeVeille, etatPourCockpit, SEUIL_HEURES, type EntreesVeille } from "@/veille/regles";

const MAINTENANT = new Date("2026-11-20T10:00:00Z");
const il_y_a = (h: number) => new Date(MAINTENANT.getTime() - h * 3_600_000);
const calme: EntreesVeille = { lignesSansProposition: 0, plusAncienneSansProposition: null, derniereProposition: il_y_a(2), commandesSansReponse: 0, plusAncienneSansReponse: null };

describe("veille · règles pures", () => {
  it("rien à signaler quand tout est calme", () => {
    expect(alertesDeVeille(calme, MAINTENANT)).toEqual([]);
    expect(SEUIL_HEURES).toBe(24);
  });

  it("semaine non proposée : des lignes attendues sans proposition depuis plus de 24 h", () => {
    const e = { ...calme, lignesSansProposition: 3, plusAncienneSansProposition: il_y_a(30), derniereProposition: il_y_a(50) };
    expect(alertesDeVeille(e, MAINTENANT).map((a) => a.code)).toEqual(["semaine-non-proposee"]);
  });

  it("semaine non proposée : pas d'alerte à 24 h pile ni si une proposition est récente", () => {
    expect(alertesDeVeille({ ...calme, lignesSansProposition: 2, plusAncienneSansProposition: il_y_a(24), derniereProposition: null }, MAINTENANT)).toEqual([]);
    expect(alertesDeVeille({ ...calme, lignesSansProposition: 2, plusAncienneSansProposition: il_y_a(40), derniereProposition: il_y_a(5) }, MAINTENANT)).toEqual([]);
  });

  it("commande sans réponse depuis plus de 24 h", () => {
    const e = { ...calme, commandesSansReponse: 2, plusAncienneSansReponse: il_y_a(25) };
    expect(alertesDeVeille(e, MAINTENANT).map((a) => a.code)).toEqual(["commande-sans-reponse"]);
    expect(alertesDeVeille({ ...e, plusAncienneSansReponse: il_y_a(23) }, MAINTENANT)).toEqual([]);
  });

  it("activité revenue : l'alerte disparaît seule", () => {
    const muet = { ...calme, commandesSansReponse: 1, plusAncienneSansReponse: il_y_a(48), lignesSansProposition: 1, plusAncienneSansProposition: il_y_a(48), derniereProposition: null };
    expect(alertesDeVeille(muet, MAINTENANT)).toHaveLength(2);
    expect(alertesDeVeille({ ...muet, commandesSansReponse: 0, plusAncienneSansReponse: null, lignesSansProposition: 0, plusAncienneSansProposition: null }, MAINTENANT)).toEqual([]);
  });

  it("la carte est une carte de « Ma journée », sans e-mail, nom ni secret, en français", () => {
    const alertes = alertesDeVeille({ ...calme, commandesSansReponse: 2, plusAncienneSansReponse: il_y_a(30), lignesSansProposition: 1, plusAncienneSansProposition: il_y_a(30), derniereProposition: null }, MAINTENANT);
    const cartes = cartesDeVeille(alertes);
    expect(cartes).toHaveLength(2);
    for (const c of cartes) {
      expect(c.cle).toMatch(/^calcul:veille-/);
      expect(c.bouton.length).toBeGreaterThan(0);
      expect(JSON.stringify(c)).not.toMatch(/@|secret|token|jeton|http/i);
    }
  });

  it("l'état transmis au cockpit est minimal : codes, nombres, instant ; aucun texte libre", () => {
    const alertes = alertesDeVeille({ ...calme, commandesSansReponse: 2, plusAncienneSansReponse: il_y_a(30) }, MAINTENANT);
    expect(etatPourCockpit(alertes, MAINTENANT)).toEqual({
      version: 1,
      calculeLe: "2026-11-20T10:00:00.000Z",
      alertes: [{ code: "commande-sans-reponse", nombre: 2 }],
    });
  });
});

describe("veille · branchement", () => {
  it("livrée éteinte et sans toucher à l'export", () => {
    const idx = readFileSync("src/veille/index.ts", "utf8");
    expect(idx).toMatch(/interrupteurAllume\(INTERRUPTEUR_VEILLE\)/);
    expect(readFileSync("src/cartes/index.ts", "utf8")).toMatch(/@\/veille/);
    expect(idx).not.toMatch(/src\/export|@\/export/);
  });
});

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("veille · en base (fictive)", () => {
  it("la commande « reçue » restée sans suite et la ligne non proposée donnent les deux alertes ; elles disparaissent au retour de l'activité", async () => {
    const { randomBytes } = await import("node:crypto");
    const { Pool } = await import("pg");
    const schema = `essai_${randomBytes(4).toString("hex")}`;
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    try {
      const { utiliserPool } = await import("@/lib/base");
      const { jouerMigrations } = await import("@/lib/migrations");
      utiliserPool(p);
      await jouerMigrations(p);
      // Interrupteur absent de la base de départ : posé ici pour l'essai seulement.
      await p.query(`INSERT INTO interrupteur (code, nom, description, allume) VALUES ('veille', 'Veille', 'essai', true) ON CONFLICT (code) DO UPDATE SET allume = true`);
      const { alertesDuMoment, lireEntrees } = await import("@/veille");
      expect(await alertesDuMoment()).toEqual([]);

      const [a] = (await p.query(
        `INSERT INTO calendrier_ligne (reseau, type_contenu, prevue_le, cree_le) VALUES
           ('instagram', 'video', now() + interval '2 days', now() - interval '3 days'),
           ('linkedin', 'texte', now() + interval '3 days', now() - interval '3 days') RETURNING id`,
      )).rows;
      await p.query(
        `INSERT INTO commande_studio (cle, calendrier_ligne, reseau, compte, type_contenu, jour, instant, etat_envoi, etat_studio, envoyee_le)
         VALUES ('cle-essai', $1, 'instagram', 'compte-essai', 'video', current_date + 2, now() + interval '2 days', 'envoyee', 'recue', now() - interval '2 days')`,
        [a.id],
);
      const entrees = await lireEntrees();
      expect(entrees.commandesSansReponse).toBe(1);
      expect(entrees.lignesSansProposition).toBe(1); // la ligne b seule : a est déjà proposée
      expect((await alertesDuMoment()).map((x) => x.code)).toEqual(["semaine-non-proposee", "commande-sans-reponse"]);

      // Une proposition récente : la semaine est proposée, plus d'alerte « semaine non proposée ».
      await p.query(`UPDATE commande_studio SET envoyee_le = now() - interval '1 hour', etat_studio = 'programmee' WHERE cle = 'cle-essai'`);
      expect(await alertesDuMoment()).toEqual([]);
    } finally {
      await p.end();
    }
  });
});
