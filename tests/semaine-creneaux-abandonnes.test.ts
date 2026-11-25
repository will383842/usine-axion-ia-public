/**
 * Semaine proposée : jamais de créneau abandonné en silence. Un métier allumé dont aucun cas d'usage n'est validé ne donne que la nouveauté
 * du moment : une seule proposition sur douze créneaux, sans un mot. La réponse doit dire combien, pourquoi et quel geste faire.
 * Base, Studio et données fictifs : rien de réel.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ReponseSemaine } from "@/contrats";

const url = process.env.DATABASE_URL;
// Samedi 28/02/2099, 2 h de Paris : la demande du fondateur pour la semaine du lundi 02/03 (dates lointaines : l'essai ne dépend pas du jour réel).
const LUNDI = "2099-03-02";
const SAMEDI = new Date("2099-02-28T01:00:00Z");

describe.skipIf(!url)("semaine · aucun créneau abandonné en silence", () => {
  const schema = `essai_${randomBytes(4).toString("hex")}`;
  let p: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 1 });
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const { utiliserPool } = await import("@/lib/base");
    utiliserPool(p);
    const { jouerMigrations } = await import("@/lib/migrations");
    await jouerMigrations(p);
    await p.query("INSERT INTO secteur (code, nom) VALUES ('essai', 'Secteur d''essai')");
    for (const [i, s] of ["formation", "audit"].entries()) await p.query("INSERT INTO service (code, nom, ordre) VALUES ($1, $1, $2) ON CONFLICT (code) DO NOTHING", [s, i]);
    for (const t of ["TPE", "PME"]) await p.query("INSERT INTO taille (code, nom, poids, actif) VALUES ($1, $1, '1', 'oui')", [t]);
    for (const [i, f] of ["scène vécue", "constat partagé", "contre-pied", "énumération", "actualité"].entries())
      await p.query("INSERT INTO accroche (code, famille, types_contenu, modele, etat) VALUES ($1, $2, 'video', 'Un modèle.', 'valide')", [`accroche.essai-${i}`, f]);
    await p.query("INSERT INTO format_video (code, nom, statut, en_lot, etat) VALUES ('tableau-anime', 'Tableau animé', 'actif', 'oui', 'valide')");
    await p.query("INSERT INTO appel (code, reseaux, cible, type_contenu, type, objectif, dit, etat) VALUES ('fin-if-question', 'instagram ; facebook', 'clients', 'video', 'question', 'QUESTION', 'Et chez vous ?', 'valide')");
    for (const r of ["instagram", "facebook"]) await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom, actif, etat) VALUES ($1, $2, 'essai', 'page', 'Compte fictif', true, 'valide')", [`${r}:essai`, r]);
    await p.query("INSERT INTO metier (code, secteur, nom, allume, etat) VALUES ('essai.generaliste', 'essai', 'Généraliste', true, 'propose')");
    await p.query("INSERT INTO famille (code, nom, rythme_cible, etat) VALUES ('B', 'Actualités', '1', 'valide')");
    await p.query("INSERT INTO actualite (code, titre, source, retenue, etat) VALUES ('essai.actu', 'Une nouveauté d''essai', 'https://exemple.example.com/source', 'oui', 'valide')");
  });
  afterAll(async () => {
    await p?.end();
    const admin = new Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  beforeEach(() => p.query("BEGIN"));
  afterEach(() => p.query("ROLLBACK"));

  const semaine = async () => {
    const { lireSemaineProposee } = await import("@/planification/lecture");
    return JSON.parse(JSON.stringify(await lireSemaineProposee(LUNDI, undefined, SAMEDI))) as ReponseSemaine;
  };
  const erreur = async () => {
    const { lireSemaineProposee } = await import("@/planification/lecture");
    return lireSemaineProposee(LUNDI, undefined, SAMEDI).then(() => null, (e: { code: string; message: string }) => ({ code: e.code, phrase: e.message }));
  };
  const valider = (cas: number) =>
    p.query("UPDATE metier SET etat = 'valide' WHERE code = 'essai.generaliste'").then(async () => {
      await p.query("INSERT INTO douleur (code, cible, services, dite, etat) VALUES ('essai.generaliste.d1', 'essai.generaliste', 'formation', 'Une douleur dite.', 'valide')");
      for (let k = 1; k <= cas; k++)
        await p.query("INSERT INTO cas_usage (code, cible, service, titre, source, etat) VALUES ($1, 'essai.generaliste', 'formation', $2, 'https://exemple.example.com/source', 'valide')", [`essai.generaliste.formation.c0${k}`, `Cas d'essai ${k}`]);
    });

  it("métier validé mais sans cas d'usage validé : seule la nouveauté sort, et la réponse le dit avec le geste à faire", async () => {
    await valider(0);
    const r = await semaine();
    expect(r.propositions).toHaveLength(1);
    expect(r.propositions[0].titre).toBe("Une nouveauté d'essai");
    expect(r.message).toMatch(/^1 proposition sur 12 créneaux/);
    expect(r.message).toMatch(/Mes métiers/);
  });

  it("des cas d'usage validés : les douze créneaux sont remplis, aucun message de manque", async () => {
    await valider(3);
    const r = await semaine();
    expect(r.propositions).toHaveLength(12);
    expect(r.message).toBeUndefined();
  });

  it("la nouveauté seule est déjà retenue pour la semaine : 409 « aucun sujet », jamais « semaine pleine »", async () => {
    await valider(0);
    const s = (await semaine()).propositions[0].sujet!;
    await p.query(
      "INSERT INTO deja_fabrique (type_contenu, actualite, format, structure, signature, note) VALUES ('video', $1, $2, $3, $4, 'Retenu au studio : 0042-AV-TT')",
      [s.actualite!.code, s.format.code, s.parts.structure, s.signature],
    );
    const e = await erreur();
    expect(e?.code).toBe("aucun_sujet");
  });
  it("fin absente pour Facebook : le message nomme la vraie raison (la fin), jamais le manque de sujets", async () => {
    await valider(1);
    await p.query("UPDATE appel SET reseaux = 'instagram' WHERE code = 'fin-if-question'");
    const r = await semaine();
    expect(r.message).toMatch(/phrase de fin pour Facebook/);
    expect(r.message).not.toMatch(/sujets neufs/);
  });

  it("le compte du message compte aussi les lignes du calendrier renvoyées", async () => {
    await valider(0);
    const { instantDeParis } = await import("@/planification/regles");
    await p.query("INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le) VALUES ('instagram', 'instagram:essai', 'video', $1)", [instantDeParis("2099-03-03", "09:00")]);
    const r = await semaine();
    expect(r.propositions).toHaveLength(2);
    expect(r.message).toMatch(/^2 propositions sur /);
  });
});
