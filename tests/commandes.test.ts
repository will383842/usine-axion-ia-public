/** U-COMMANDE · proposer une ligne du calendrier au Studio et relire son état. Aucun appel réel : la passerelle est une doublure. */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ETATS_COMMANDE_STUDIO } from "@/contrats";
import { LIBELLE_ETAT_STUDIO, cleCommande, corpsDeLigne, lireReponseCommande, lireReponseLecture, type LigneAProposer } from "@/commandes/regles";

const appelerStudio = vi.fn();
vi.mock("@/passerelles/studio", () => ({ appelerStudio: (...a: unknown[]) => appelerStudio(...a) }));

const fixture = (nom: string) => JSON.parse(readFileSync(`tests/fixtures/porte-v2/${nom}.json`, "utf8")) as Record<string, { statut: number; corps: unknown } & Record<string, unknown>>;
const recue = fixture("commande-recue");
const misedecote = fixture("commande-mise-de-cote");
const erreurs = fixture("erreurs");
const lectures = fixture("lecture-etats");

const MOTS_INTERDITS = /\b(CRM|lead|batch|job|prompt|token|jeton|contrat|workflow|persona|pipeline|aimant|séquence|HTTP|\d{3})\b/i;
const futur = new Date("2099-12-10T08:30:00.000Z");
const ligne = (surcharge: Partial<LigneAProposer> = {}): LigneAProposer => ({
  id: "42",
  reseau: "linkedin",
  compte: "linkedin:compte-fictif-1",
  type_contenu: "video",
  prevue_le: futur,
  lot_ligne: null,
  ...surcharge,
});

describe("commandes · partie pure", () => {
  it("la clé est un SHA-256 stable pour une même ligne, distincte d'une autre", () => {
    expect(cleCommande("42")).toMatch(/^[0-9a-f]{64}$/);
    expect(cleCommande("42")).toBe(cleCommande("42"));
    expect(cleCommande("42")).not.toBe(cleCommande("43"));
  });

  it("le corps est strict : exactement les clés prévues, sans montant ni état ni média", () => {
    const r = corpsDeLigne(ligne(), new Date("2099-01-01T00:00:00Z"));
    if (!r.ok) throw new Error("refus inattendu");
    expect(Object.keys(r.corps).sort()).toEqual(["cle", "compteCible", "contrat", "instant", "jour", "reseau"]);
    const avecLot = corpsDeLigne(ligne({ lot_ligne: "L1-2" }), new Date("2099-01-01T00:00:00Z"));
    if (!avecLot.ok) throw new Error("refus inattendu");
    expect(Object.keys(avecLot.corps)).toContain("repere");
    const texte = JSON.stringify(avecLot.corps);
    for (const interdit of ["videoId", "visuelId", "cout_max_eur"]) expect(texte).not.toContain(interdit);
    for (const [cle, valeur] of Object.entries(avecLot.corps)) {
      if (cle === "cle") continue;
      expect(`${cle} ${valeur}`).not.toMatch(/eur|cent|prix|budget|plafond|statut|etat|valid|programm|publi|zernio|buffer/i);
    }
  });

  it("refuse sans appel : compte absent, date passée, YouTube", () => {
    const maintenant = new Date("2099-01-01T00:00:00Z");
    expect(corpsDeLigne(ligne({ compte: null }), maintenant)).toEqual({ ok: false, phrase: "Choisissez d'abord le compte." });
    expect(corpsDeLigne(ligne({ prevue_le: new Date("2098-01-01T00:00:00Z") }), maintenant)).toEqual({ ok: false, phrase: "Cette date est passée : changez de jour." });
    expect(corpsDeLigne(ligne({ reseau: "youtube" }), maintenant)).toEqual({ ok: false, phrase: "YouTube est éteint pour l'instant." });
    expect(corpsDeLigne(ligne({ reseau: "youtube-shorts" }), maintenant).ok).toBe(false);
  });

  it("chaque réponse de la porte donne l'état et une phrase sans code ni mot interdit", () => {
    const attendu: Array<[{ statut: number; corps: unknown }, string, string | null]> = [
      [recue.creee, "envoyee", "recue"],
      [recue.deja, "envoyee", "recue"],
      [misedecote.mise_de_cote, "mise_de_cote_studio", "mise_de_cote"],
      [erreurs.arret, "non_envoyee", null],
      [erreurs.champ_invalide, "non_envoyee", null],
      [erreurs.non_autorise, "non_envoyee", null],
      [erreurs.introuvable, "non_envoyee", null],
      [erreurs.version, "non_envoyee", null],
      [erreurs.trop_de_demandes, "non_envoyee", null],
      [erreurs.panne, "non_envoyee", null],
      [erreurs.illisible, "non_envoyee", null],
      [erreurs.forme_inattendue, "non_envoyee", null],
    ];
    for (const [r, envoi, studio] of attendu) {
      const issue = lireReponseCommande(r.statut, r.corps);
      expect(issue.etat_envoi).toBe(envoi);
      expect(issue.etat_studio).toBe(studio);
      expect(issue.message).not.toMatch(MOTS_INTERDITS);
    }
    expect(lireReponseCommande(423, erreurs.arret.corps).message).toBe("Le Studio est à l'arrêt.");
  });

  it("la lecture recopie les neuf états, valideeLe et refuseLe ; le reste rend null", () => {
    expect(Object.keys(lectures).sort()).toEqual([...ETATS_COMMANDE_STUDIO].sort());
    for (const etat of ETATS_COMMANDE_STUDIO) {
      expect(lireReponseLecture(200, lectures[etat])?.etat_studio).toBe(etat);
      expect(LIBELLE_ETAT_STUDIO[etat]).not.toMatch(MOTS_INTERDITS);
    }
    expect(lireReponseLecture(200, lectures.programmee)?.valide_le?.toISOString()).toBe("2099-12-01T10:00:00.000Z");
    expect(lireReponseLecture(200, lectures.refusee)?.refuse_le?.toISOString()).toBe("2099-12-01T10:00:00.000Z");
    expect(lireReponseLecture(404, erreurs.introuvable.corps)).toBeNull();
    expect(lireReponseLecture(200, { etat: "inconnu", jour: "2099-12-10" })).toBeNull();
    expect(lireReponseLecture(200, null)).toBeNull();
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("commandes · en base, avec une doublure du Studio", () => {
  const jourFutur = () => "2099-12-10T08:30:00Z";
  const nouvelleLigne = async (surcharge: { reseau?: string; compte?: string | null; type?: string; prevue?: string; archivee?: boolean } = {}) => {
    const compte = surcharge.compte === undefined ? "linkedin:compte-fictif-1" : surcharge.compte;
    if (compte) await p.query(`INSERT INTO compte (code, reseau, identifiant, nature, nom) VALUES ($1, 'linkedin', 'compte-fictif-1', 'page', 'Compte fictif') ON CONFLICT DO NOTHING`, [compte]);
    const r = await p.query(
      `INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le, archive_le) VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
      [surcharge.reseau ?? "linkedin", compte, surcharge.type ?? "video", surcharge.prevue ?? jourFutur(), surcharge.archivee ? new Date() : null],
    );
    return r.rows[0].id as string;
  };
  const regler = (code: string, allume: boolean) => p.query("UPDATE interrupteur SET allume = $2 WHERE code = $1", [code, allume]);
  const etat = async (id: string) => (await p.query("SELECT * FROM commande_studio WHERE calendrier_ligne = $1", [id])).rows;

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
  });
  beforeEach(async () => {
    appelerStudio.mockReset();
    appelerStudio.mockResolvedValue({ envoye: true, statut: recue.creee.statut, corps: recue.creee.corps });
    await regler("commandes.studio", true);
    await regler("arret.tout", false);
  });

  it("migration : rejouable, interrupteur éteint par défaut et jamais réécrit", async () => {
    const { rows } = await p.query("SELECT allume FROM interrupteur WHERE code = 'commandes.studio'");
    expect(rows).toHaveLength(1);
    const sql = readFileSync("migrations/036-commandes-studio.sql", "utf8");
    await regler("commandes.studio", true);
    await p.query(sql);
    await p.query(sql);
    expect((await p.query("SELECT allume FROM interrupteur WHERE code = 'commandes.studio'")).rows).toEqual([{ allume: true }]);
    expect(sql).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/i);
    expect(sql).not.toMatch(/\b(cout\w*|\w+_eur|cents?|prix|budget|plafond)\b/i);
  });

  it("éteint : aucun appel, aucune ligne, phrase claire", async () => {
    const { proposerAuStudio } = await import("@/commandes/service");
    await regler("commandes.studio", false);
    const id = await nouvelleLigne();
    const r = await proposerAuStudio(id);
    expect(r.message).toBe("Les échanges avec le Studio sont éteints.");
    expect(appelerStudio).not.toHaveBeenCalled();
    expect(await etat(id)).toHaveLength(0);
  });

  it("passerelle éteinte (interrupteur ou secret) : non envoyée avec une phrase, rien ne part", async () => {
    const { proposerAuStudio } = await import("@/commandes/service");
    appelerStudio.mockResolvedValue({ envoye: false });
    const id = await nouvelleLigne();
    const r = await proposerAuStudio(id);
    expect(r.etat_envoi).toBe("non_envoyee");
    expect(r.message).toMatch(/pas encore branché/);
    expect((await etat(id))[0].etat_envoi).toBe("non_envoyee");
  });

  it("« Tout arrêter » actif ou illisible : 0 appel, non envoyée, « Tout est arrêté. »", async () => {
    const { proposerAuStudio } = await import("@/commandes/service");
    await regler("arret.tout", true);
    const id = await nouvelleLigne();
    expect(await proposerAuStudio(id)).toEqual({ message: "Tout est arrêté.", etat_envoi: "non_envoyee" });
    expect(appelerStudio).not.toHaveBeenCalled();
    await p.query("UPDATE interrupteur SET archive_le = now() WHERE code = 'arret.tout'");
    const id2 = await nouvelleLigne();
    expect((await proposerAuStudio(id2)).message).toBe("Tout est arrêté.");
    expect(appelerStudio).not.toHaveBeenCalled();
    await p.query("UPDATE interrupteur SET archive_le = NULL WHERE code = 'arret.tout'");
  });

  it("idempotence : deux gestes simultanés, une seule ligne et un seul appel ; une ligne envoyée n'est jamais renvoyée", async () => {
    const { proposerAuStudio } = await import("@/commandes/service");
    const id = await nouvelleLigne();
    await Promise.all([proposerAuStudio(id), proposerAuStudio(id)]);
    expect(appelerStudio).toHaveBeenCalledTimes(1);
    expect(appelerStudio.mock.calls[0][0]).toBe("usine/commandes");
    const lignes = await etat(id);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].cle).toBe(cleCommande(id));
    expect(lignes[0].etat_envoi).toBe("envoyee");
    await proposerAuStudio(id);
    expect(appelerStudio).toHaveBeenCalledTimes(1);
  });

  it("une proposition non envoyée peut être rejouée sans seconde ligne", async () => {
    const { proposerAuStudio } = await import("@/commandes/service");
    const id = await nouvelleLigne();
    appelerStudio.mockResolvedValueOnce({ envoye: true, statut: 500, corps: null });
    expect((await proposerAuStudio(id)).etat_envoi).toBe("non_envoyee");
    expect((await proposerAuStudio(id)).etat_envoi).toBe("envoyee");
    expect(await etat(id)).toHaveLength(1);
  });

  it("l'exception de la passerelle est rattrapée", async () => {
    const { proposerAuStudio } = await import("@/commandes/service");
    appelerStudio.mockRejectedValueOnce(new Error("réseau"));
    const r = await proposerAuStudio(await nouvelleLigne());
    expect(r).toEqual({ message: "Le Studio ne répond pas pour l'instant.", etat_envoi: "non_envoyee" });
  });

  it("refus locaux sans appel : compte absent, date passée, YouTube, ligne archivée", async () => {
    const { proposerAuStudio } = await import("@/commandes/service");
    expect((await proposerAuStudio(await nouvelleLigne({ compte: null }))).message).toBe("Choisissez d'abord le compte.");
    expect((await proposerAuStudio(await nouvelleLigne({ prevue: "2001-01-01T08:00:00Z" }))).message).toBe("Cette date est passée : changez de jour.");
    expect((await proposerAuStudio(await nouvelleLigne({ reseau: "youtube" }))).message).toBe("YouTube est éteint pour l'instant.");
    expect((await proposerAuStudio(await nouvelleLigne({ archivee: true }))).message).toBe("Cette ligne n'existe plus.");
    expect(appelerStudio).not.toHaveBeenCalled();
  });

  it("mise de côté (202) : la ligne reste visible avec sa phrase, puis la relecture la passe à « reçue »", async () => {
    const { proposerAuStudio, relireDepuisStudio } = await import("@/commandes/service");
    appelerStudio.mockResolvedValueOnce({ envoye: true, statut: 202, corps: misedecote.mise_de_cote.corps });
    const id = await nouvelleLigne();
    const r = await proposerAuStudio(id);
    expect(r.etat_envoi).toBe("mise_de_cote_studio");
    expect((await etat(id))[0].message).toMatch(/mis cette commande de côté/);
    appelerStudio.mockResolvedValue({ envoye: true, statut: 200, corps: lectures.recue });
    await relireDepuisStudio();
    const apres = (await etat(id))[0];
    expect(apres.etat_studio).toBe("recue");
    expect(apres.etat_envoi).toBe("envoyee");
  });

  it("relecture : neuf états recopiés, 20 appels au plus, 404 et forme inattendue gardent l'état, rien n'est écrit dans le calendrier ni les lots", async () => {
    const { relireDepuisStudio } = await import("@/commandes/service");
    await p.query("UPDATE commande_studio SET archive_le = now() WHERE archive_le IS NULL");
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const id = await nouvelleLigne({ prevue: `2099-12-${String(10 + (i % 15)).padStart(2, "0")}T08:30:00Z` });
      ids.push(id);
      await p.query(
        `INSERT INTO commande_studio (cle, calendrier_ligne, reseau, compte, type_contenu, jour, instant, etat_envoi, etat_studio) VALUES ($1, $2, 'linkedin', 'linkedin:compte-fictif-1', 'video', '2099-12-10', '2099-12-10T08:30:00Z', 'envoyee', 'recue')`,
        [cleCommande(id), id],
      );
    }
    const avantCalendrier = (await p.query("SELECT count(*), max(modifie_le) FROM calendrier_ligne")).rows[0];
    appelerStudio.mockImplementation(async (chemin: string) => {
      const n = appelerStudio.mock.calls.length;
      expect(chemin).toMatch(/^usine\/commandes\/[0-9a-f]{64}$/);
      if (n === 1) return { envoye: true, statut: 404, corps: erreurs.introuvable.corps };
      if (n === 2) return { envoye: true, statut: 200, corps: { autre: "chose" } };
      return { envoye: true, statut: 200, corps: lectures[ETATS_COMMANDE_STUDIO[(n - 3) % 9]] };
    });
    const r = await relireDepuisStudio(50);
    expect(appelerStudio).toHaveBeenCalledTimes(20);
    expect(r.relues).toBe(18);
    const rows = (await p.query("SELECT * FROM commande_studio WHERE archive_le IS NULL AND relue_le IS NOT NULL ORDER BY relue_le, cle")).rows;
    expect(rows).toHaveLength(20);
    const vus = new Set(rows.map((x) => x.etat_studio));
    for (const e of ETATS_COMMANDE_STUDIO) expect(vus.has(e)).toBe(true);
    const perdues = rows.filter((x) => x.message === "Le Studio ne trouve plus cette commande.");
    expect(perdues).toHaveLength(1);
    expect(perdues[0].etat_studio).toBe("recue");
    expect(rows.some((x) => x.etat_studio === "programmee" && x.valide_le)).toBe(true);
    expect(rows.some((x) => x.etat_studio === "refusee" && x.refuse_le)).toBe(true);
    expect((await p.query("SELECT count(*), max(modifie_le) FROM calendrier_ligne")).rows[0]).toEqual(avantCalendrier);
    expect((await p.query("SELECT count(*) FROM lot_ligne")).rows[0].count).toBe("0");
  });

  it("quota atteint : le geste passe quand même et le palier 100 % s'affiche", async () => {
    const { proposerAuStudio, palierDeLigne } = await import("@/commandes/service");
    await p.query("UPDATE commande_studio SET archive_le = now() WHERE archive_le IS NULL");
    await p.query(`INSERT INTO reglage (cle, valeur) VALUES ('quotas_production', $1::jsonb) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur`, [
      JSON.stringify({ linkedin: { video: { periode: "jour", quantite: 1 }, carrousel: { periode: "jour", quantite: 1 }, image: { periode: "jour", quantite: 1 } } }),
    ]);
    const a = await nouvelleLigne();
    const b = await nouvelleLigne();
    expect((await proposerAuStudio(a)).etat_envoi).toBe("envoyee");
    expect((await palierDeLigne("linkedin", "video", "2099-12-10"))?.palier).toBe(100);
    expect((await proposerAuStudio(b)).etat_envoi).toBe("envoyee");
  });
});
