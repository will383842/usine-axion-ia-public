/**
 * Réserve de tutoriels : un passage demande, suit, pose le créneau puis propose la commande avec `videoId`. Éteint par défaut.
 * Pièces pures d'abord ; puis, sur une vraie base (DATABASE_URL), tout le cycle avec une doublure du Studio. Données fictives, aucun appel réel.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ajouterJours } from "@/calendrier/regles";
import { instantDeParis } from "@/planification/regles";
import { RYTHMES_DEFAUT } from "@/reglages/modele";
import { QUOTAS_DEFAUT } from "@/reglages/quotas";
import { estPublic } from "@/proxy";
import { ESSAIS_MAX_PAR_SEMAINE, cleTutoriel, creneauTutoriel, lireReponseSuivi, lireReponseTirage, lundiCible, rythmesSansTutoriel } from "@/tutoriels/regles";

const appelerStudio = vi.fn();
const lireOccupesDuStudio = vi.fn();
vi.mock("@/passerelles/studio", () => ({ appelerStudio: (...a: unknown[]) => appelerStudio(...a), lireOccupesDuStudio: (...a: unknown[]) => lireOccupesDuStudio(...a) }));

describe("tutoriels · pièces pures", () => {
  it("T12 · la clé passe le chemin de la passerelle et le format du Studio ; le lundi visé est le lundi suivant (dimanche soir, heure d'été)", () => {
    const cle = cleTutoriel("2099-03-02", 1);
    expect(cle).toBe("tuto-2099-03-02-1");
    expect(cle).toMatch(/^[A-Za-z0-9._:-]{8,94}$/);
    expect(`usine/tutoriels/${cle}`).toMatch(/^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i);
    expect(() => cleTutoriel("2099-3-2", 1)).toThrow();
    expect(() => cleTutoriel("2099-03-02", 0)).toThrow();
    expect(lundiCible(new Date("2099-03-01T21:00:00Z"))).toBe("2099-03-02"); // dimanche soir
    expect(lundiCible(new Date("2099-03-02T08:00:00Z"))).toBe("2099-03-09"); // un lundi : le suivant
    expect(lundiCible(new Date("2099-03-29T21:30:00Z"))).toBe("2099-03-30"); // dimanche 23 h 30 de Paris, jour du passage à l'heure d'été
    expect(lundiCible(new Date("2099-03-28T23:30:00Z"))).toBe("2099-03-30"); // déjà dimanche à Paris
  });

  it("T12 · lecture du tirage : chaque forme ; tout le reste est à rejouer", () => {
    expect(lireReponseTirage(200, { etat: "pris", deja: false, elementId: "e1", videoId: "vid.1:a" })).toEqual({ genre: "pris", elementId: "e1", videoId: "vid.1:a", deja: false });
    expect(lireReponseTirage(200, { etat: "pris", deja: true, elementId: "e1" })).toEqual({ genre: "pris", elementId: "e1", deja: true });
    expect(lireReponseTirage(200, { etat: "pris", elementId: "e1", videoId: "mauvais id", extra: 1 })).toEqual({ genre: "pris", elementId: "e1", deja: false });
    expect(lireReponseTirage(200, { etat: "echec", elementId: "e2", retourEnReserve: true })).toEqual({ genre: "echec", elementId: "e2" });
    expect(lireReponseTirage(200, { etat: "reserve_vide" })).toMatchObject({ genre: "rejouer" });
    expect(lireReponseTirage(200, { etat: "attente", raison: "bail_occupe" })).toMatchObject({ genre: "rejouer", raison: "attente_bail_occupe" });
    expect(lireReponseTirage(200, { etat: "eteint" })).toMatchObject({ genre: "rejouer" });
    for (const [s, c] of [[423, { erreur: "x" }], [400, null], [500, null], [200, "texte"], [200, null], [200, { etat: "inconnu" }], [200, { etat: "pris" }]] as const) {
      expect(lireReponseTirage(s, c), `${s}`).toMatchObject({ genre: "rejouer" });
    }
  });

  it("T12 · lecture du suivi : en cours, à valider (avec videoId), perdu ; sans videoId ou illisible : à rejouer", () => {
    expect(lireReponseSuivi(200, { etat: "pris", elementId: "e", aValider: false })).toEqual({ genre: "en_cours", etat: "pris" });
    expect(lireReponseSuivi(200, { etat: "fait", elementId: "e", videoId: "v1", aValider: false })).toEqual({ genre: "en_cours", etat: "fait", videoId: "v1" });
    expect(lireReponseSuivi(200, { etat: "fait", elementId: "e", videoId: "v1", aValider: true })).toEqual({ genre: "a_valider", videoId: "v1" });
    expect(lireReponseSuivi(200, { etat: "fait", elementId: "e", aValider: true })).toEqual({ genre: "rejouer" });
    expect(lireReponseSuivi(200, { etat: "a_revoir", elementId: "e", aValider: false })).toEqual({ genre: "perdu", etat: "a_revoir" });
    expect(lireReponseSuivi(200, { etat: "en_reserve", elementId: "e", aValider: false })).toEqual({ genre: "perdu", etat: "en_reserve" });
    for (const [s, c] of [[404, null], [500, null], [200, "x"], [200, { etat: "pris" }]] as const) expect(lireReponseSuivi(s, c)).toEqual({ genre: "rejouer" });
  });

  it("T12 · YouTube est refusé comme réseau du tutoriel ; un rythme réduit d'une place pour Instagram seulement", () => {
    const entrees = { lundi: "2099-03-02", reseau: "youtube" as const, compte: "youtube:essai", lignes: [], rythmes: RYTHMES_DEFAUT, quotas: QUOTAS_DEFAUT, occupes: [], maintenant: new Date("2099-03-01T10:00:00Z") };
    expect(creneauTutoriel(entrees)).toBeNull();
    expect(creneauTutoriel({ ...entrees, reseau: "youtube-shorts" })).toBeNull();
    expect(creneauTutoriel({ ...entrees, reseau: "instagram", compte: "instagram:essai" })).not.toBeNull();
    const r = rythmesSansTutoriel({ ...RYTHMES_DEFAUT, instagram: { min: 3, max: 7 }, facebook: { min: 1, max: 1 } });
    expect(r.instagram).toEqual({ min: 2, max: 6 });
    expect(r.facebook).toEqual({ min: 1, max: 1 });
    expect(rythmesSansTutoriel({ ...RYTHMES_DEFAUT, instagram: { min: 0, max: 1 } }).instagram).toEqual({ min: 0, max: 0 });
    expect(ESSAIS_MAX_PAR_SEMAINE).toBe(2);
  });

  it("T13 · le proxy laisse passer la route de l'horloge des tutoriels, et elle seule autour", () => {
    expect(estPublic("/api/horloge/tutoriels")).toBe(true);
    for (const x of ["/api/horloge/tutoriels/x", "/api/horloge/tutorielss", "/api/tutoriels"]) expect(estPublic(x)).toBe(false);
  });
});

describe("tutoriels · serveur", () => {
  it("R3 · la ligne des tutoriels ne peut jamais appeler la semaine, même si `.env.horloge` définit `HORLOGE_URL` ; commentaire « ou »", () => {
    const sh = readFileSync("deploiement/proposer-semaine.sh", "utf8");
    const cron = readFileSync("deploiement/crontab", "utf8");
    const ligne = cron.split("\n").find((l) => l.startsWith("*/30"))!;
    expect(ligne).toMatch(/^\*\/30 \* \* \* \* root HORLOGE_URL_FORCEE=http:\/\/127\.0\.0\.1:3000\/api\/horloge\/tutoriels /);
    expect(ligne).not.toMatch(/ HORLOGE_URL=/);
    // La variable forcée est lue AVANT le fichier d'environnement et l'emporte sur `HORLOGE_URL`.
    expect(sh.indexOf("HORLOGE_URL_FORCEE")).toBeGreaterThan(-1);
    expect(sh.indexOf("HORLOGE_URL_FORCEE")).toBeLessThan(sh.indexOf(". \"$ENV_FICHIER\""));
    expect(sh).toMatch(/URL="\$\{URL_FORCEE:-\$\{HORLOGE_URL:-/);
    expect(cron).toMatch(/HORLOGE_ACTIVE ≠ 1 ou /);
    expect(cron).not.toMatch(/HORLOGE_ACTIVE ≠ 1 et /);
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
const SECRET = "secret-d-essai-de-l-horloge-0123456789";

describe.skipIf(!url)("tutoriels · sur une vraie base, avec une doublure du Studio", () => {
  let p: Pool;
  let allumeApres048: boolean | undefined;
  let rang = 0;
  /** Une semaine à soi par essai : le dimanche 10 h (UTC) qui précède le lundi visé. */
  const semaine = () => {
    rang += 1;
    const dimanche = ajouterJours("2099-03-01", 7 * rang);
    return { dimanche, lundi: ajouterJours(dimanche, 1), t: (minutes = 0) => new Date(Date.parse(`${dimanche}T10:00:00Z`) + minutes * 60_000) };
  };
  const regler = (code: string, allume: boolean) => p.query("UPDATE interrupteur SET allume = $2 WHERE code = $1", [code, allume]);
  const appels = (chemin: string) => appelerStudio.mock.calls.filter((c) => c[0] === chemin);
  const lignes = async (lundi: string) => (await p.query("SELECT * FROM tutoriel_tirage WHERE lundi = $1 ORDER BY essai", [lundi])).rows;
  const tutoLignes = async () => (await p.query("SELECT * FROM calendrier_ligne WHERE note = 'Tutoriel de la réserve' ORDER BY id")).rows;
  const passer = async (t: Date) => (await import("@/tutoriels")).passerTutoriels(t);

  let tirage: unknown;
  let suivi: unknown;
  let vuAvantAppel: boolean[] = [];

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
    allumeApres048 = (await p.query("SELECT allume FROM interrupteur WHERE code = 'tutoriel.reserve'")).rows[0]?.allume;
    await p.query("INSERT INTO compte (code, reseau, identifiant, nature, nom, actif, etat) VALUES ('instagram:essai', 'instagram', 'essai', 'page', 'Compte fictif', true, 'valide')");
  });
  afterAll(async () => {
    await p?.end();
    const admin = new Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    appelerStudio.mockReset();
    lireOccupesDuStudio.mockReset();
    vuAvantAppel = [];
    tirage = { etat: "reserve_vide" };
    suivi = { etat: "pris", elementId: "el-1", aValider: false };
    appelerStudio.mockImplementation(async (chemin: string, corps: { cle?: string }) => {
      if (chemin === "usine/tutoriels") {
        vuAvantAppel.push(((await p.query("SELECT 1 FROM tutoriel_tirage WHERE cle = $1", [corps.cle])).rowCount ?? 0) > 0);
        if (tirage instanceof Error) throw tirage;
        return { envoye: true, statut: 200, corps: tirage };
      }
      if (chemin.startsWith("usine/tutoriels/")) return { envoye: true, statut: 200, corps: suivi };
      if (chemin === "usine/commandes") return { envoye: true, statut: 200, corps: { etat: "recue", deja: false } };
      throw new Error(`chemin inattendu ${chemin}`);
    });
    lireOccupesDuStudio.mockResolvedValue({ envoye: true, statut: 200, corps: [] });
    // Chaque essai repart d'une base sans tirage actif (on archive, on ne supprime rien).
    await p.query("UPDATE tutoriel_tirage SET archive_le = now() WHERE archive_le IS NULL");
    await regler("tutoriel.reserve", true);
    await regler("commandes.studio", true);
    await regler("arret.tout", false);
  });

  it("T1 · éteint par défaut après 048 : aucun appel, rien d'écrit", async () => {
    expect(allumeApres048).toBe(false);
    await regler("tutoriel.reserve", false);
    const s = semaine();
    expect(await passer(s.t())).toEqual({ fait: ["eteint"] });
    expect(appelerStudio).not.toHaveBeenCalled();
    expect(lireOccupesDuStudio).not.toHaveBeenCalled();
    expect(await lignes(s.lundi)).toHaveLength(0);
  });

  it("T2 · échanges avec le Studio éteints, ou « Tout arrêter » : aucun appel", async () => {
    const s = semaine();
    await regler("commandes.studio", false);
    expect((await passer(s.t())).fait).toEqual(["commandes_eteintes"]);
    await regler("commandes.studio", true);
    await regler("arret.tout", true);
    expect((await passer(s.t())).fait).toEqual(["arrete"]);
    expect(appelerStudio).not.toHaveBeenCalled();
    expect(await lignes(s.lundi)).toHaveLength(0);
  });

  it("T3 · premier passage : la ligne `tuto-<lundi>-1` est écrite AVANT l'appel, au corps exact, sur le chemin `usine/tutoriels`", async () => {
    const s = semaine();
    await passer(s.t());
    const [premier] = appels("usine/tutoriels");
    expect(premier).toEqual(["usine/tutoriels", { contrat: 2, cle: `tuto-${s.lundi}-1`, source: "reserve", jour: s.lundi }]);
    expect(vuAvantAppel).toEqual([true]);
    const l = await lignes(s.lundi);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ cle: `tuto-${s.lundi}-1`, essai: 1, reseau: "instagram", etat_tirage: "demande" });
  });

  it("T4 · réserve vide, puis attente `bail_occupe`, puis éteint : la même clé est rejouée (pas avant 60 minutes), jamais une seconde ligne", async () => {
    const s = semaine();
    await passer(s.t());
    await passer(s.t(30));
    expect(appels("usine/tutoriels")).toHaveLength(1);
    tirage = { etat: "attente", raison: "bail_occupe" };
    await passer(s.t(61));
    tirage = { etat: "eteint" };
    await passer(s.t(122));
    const cles = appels("usine/tutoriels").map((c) => (c[1] as { cle: string }).cle);
    expect(cles).toEqual([`tuto-${s.lundi}-1`, `tuto-${s.lundi}-1`, `tuto-${s.lundi}-1`]);
    const l = await lignes(s.lundi);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ etat_tirage: "demande" });
  });

  it("T5 · coupure : l'appel lève après la prise ; le passage suivant rejoue la même clé (`deja: true`), une seule ligne, `pris`", async () => {
    const s = semaine();
    tirage = new Error("coupure");
    await passer(s.t());
    expect((await lignes(s.lundi))[0]).toMatchObject({ etat_tirage: "demande" });
    tirage = { etat: "pris", deja: true, elementId: "el-1" };
    await passer(s.t(61));
    const l = await lignes(s.lundi);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ cle: `tuto-${s.lundi}-1`, etat_tirage: "pris", etat_studio: "pris", element_id: "el-1" });
    expect(new Set(appels("usine/tutoriels").map((c) => (c[1] as { cle: string }).cle))).toEqual(new Set([`tuto-${s.lundi}-1`]));
  });

  it("T6 · `echec` : essai 2 avec une nouvelle clé ; deuxième `echec` : plus aucun appel cette semaine", async () => {
    const s = semaine();
    tirage = { etat: "echec", elementId: "el-1", retourEnReserve: true };
    await passer(s.t());
    expect((await lignes(s.lundi))[0]).toMatchObject({ etat_tirage: "echec" });
    await passer(s.t(1));
    await passer(s.t(200));
    await passer(s.t(400));
    const cles = appels("usine/tutoriels").map((c) => (c[1] as { cle: string }).cle);
    expect(cles).toEqual([`tuto-${s.lundi}-1`, `tuto-${s.lundi}-2`]);
    const l = await lignes(s.lundi);
    expect(l.map((x) => x.etat_tirage)).toEqual(["echec", "echec"]);
    expect((await passer(s.t(600))).fait).toContain("plafond_essais");
    expect(appels("usine/tutoriels")).toHaveLength(2);
  });

  it("T7 · suivi `pris` puis `fait` + `aValider` : un créneau vidéo Instagram libre, PUIS la commande avec `videoId` ; rien avant", async () => {
    const s = semaine();
    const occupe = instantDeParis(s.lundi, "09:00");
    lireOccupesDuStudio.mockResolvedValue({ envoye: true, statut: 200, corps: [{ reseau: "instagram", debut: occupe.toISOString() }] });
    tirage = { etat: "pris", deja: false, elementId: "el-1" };
    await passer(s.t());
    expect(appels("usine/tutoriels/" + `tuto-${s.lundi}-1`)).toHaveLength(1);
    expect(await tutoLignes()).toHaveLength(0);
    expect(appels("usine/commandes")).toHaveLength(0);
    suivi = { etat: "fait", elementId: "el-1", videoId: "vid-001", aValider: true };
    await passer(s.t(31));
    const [ligne] = (await p.query("SELECT * FROM calendrier_ligne WHERE note = 'Tutoriel de la réserve' AND prevue_le >= $1 ORDER BY id", [instantDeParis(s.lundi, "00:00")])).rows;
    expect(ligne).toMatchObject({ reseau: "instagram", compte: "instagram:essai", type_contenu: "video", etat: "brouillon" });
    expect(Math.abs(ligne.prevue_le.getTime() - occupe.getTime())).toBeGreaterThanOrEqual(90 * 60_000);
    expect(ligne.prevue_le.getTime()).toBeGreaterThan(s.t().getTime());
    const [t] = await lignes(s.lundi);
    expect(t).toMatchObject({ etat_studio: "fait", video_id: "vid-001", calendrier_ligne: ligne.id });
    const commandes = appels("usine/commandes");
    expect(commandes).toHaveLength(1);
    expect(commandes[0][1]).toMatchObject({ contrat: 2, reseau: "instagram", videoId: "vid-001", compteCible: "instagram:essai" });
    expect(Object.keys(commandes[0][1] as object).sort()).toEqual(["cle", "compteCible", "contrat", "instant", "jour", "reseau", "videoId"]);
  });

  it("T8 · deux passages simultanés après `aValider` : une ligne, une commande (même clé de commande)", async () => {
    const s = semaine();
    tirage = { etat: "pris", elementId: "el-1" };
    await passer(s.t());
    suivi = { etat: "fait", elementId: "el-1", videoId: "vid-008", aValider: true };
    await Promise.all([passer(s.t(31)), passer(s.t(31))]);
    const [t] = await lignes(s.lundi);
    expect(t.calendrier_ligne).not.toBeNull();
    expect((await p.query("SELECT count(*)::int AS n FROM calendrier_ligne WHERE id = $1", [t.calendrier_ligne])).rows[0].n).toBe(1);
    const cmd = await p.query("SELECT cle FROM commande_studio WHERE calendrier_ligne = $1", [t.calendrier_ligne]);
    expect(cmd.rows).toHaveLength(1);
    expect(appels("usine/commandes")).toHaveLength(1);
    await passer(s.t(70));
    expect(appels("usine/commandes")).toHaveLength(1);
    expect((await tutoLignes()).filter((l) => l.id === t.calendrier_ligne)).toHaveLength(1);
  });

  it("T9 · `aValider` sans `videoId` : rien n'est posé, ni commande", async () => {
    const s = semaine();
    tirage = { etat: "pris", elementId: "el-1" };
    suivi = { etat: "fait", elementId: "el-1", aValider: true };
    await passer(s.t());
    await passer(s.t(31));
    const [t] = await lignes(s.lundi);
    expect(t).toMatchObject({ a_valider_le: null, calendrier_ligne: null, video_id: null });
    expect(appels("usine/commandes")).toHaveLength(0);
    expect(lireOccupesDuStudio).not.toHaveBeenCalled();
  });

  it("T10 · créneaux pris du Studio illisibles : rien n'est posé ; posé au passage suivant quand la lecture revient", async () => {
    const s = semaine();
    tirage = { etat: "pris", elementId: "el-1" };
    await passer(s.t());
    suivi = { etat: "fait", elementId: "el-1", videoId: "vid-010", aValider: true };
    lireOccupesDuStudio.mockResolvedValue({ envoye: true, statut: 200, corps: "pas une liste" });
    await passer(s.t(31));
    let [t] = await lignes(s.lundi);
    expect(t).toMatchObject({ calendrier_ligne: null });
    expect(t.a_valider_le).not.toBeNull();
    expect(appels("usine/commandes")).toHaveLength(0);
    lireOccupesDuStudio.mockResolvedValue({ envoye: false });
    await passer(s.t(35));
    [t] = await lignes(s.lundi);
    expect(t).toMatchObject({ calendrier_ligne: null });
    lireOccupesDuStudio.mockResolvedValue({ envoye: true, statut: 200, corps: [] });
    await passer(s.t(70));
    [t] = await lignes(s.lundi);
    expect(t.calendrier_ligne).not.toBeNull();
    expect(appels("usine/commandes")).toHaveLength(1);
  });

  it("T11 · `a_revoir` au suivi : pas de créneau ; l'essai suivant (nouvelle clé) est permis, borné à deux", async () => {
    const s = semaine();
    tirage = { etat: "pris", elementId: "el-1" };
    suivi = { etat: "a_revoir", elementId: "el-1", aValider: false };
    await passer(s.t());
    expect((await lignes(s.lundi))[0]).toMatchObject({ etat_studio: "a_revoir", calendrier_ligne: null });
    expect(await tutoLignes()).not.toContainEqual(expect.objectContaining({ prevue_le: instantDeParis(s.lundi, "09:00") }));
    suivi = { etat: "en_reserve", elementId: "el-2", aValider: false };
    await passer(s.t(31));
    const cles = appels("usine/tutoriels").map((c) => (c[1] as { cle: string }).cle);
    expect(cles).toEqual([`tuto-${s.lundi}-1`, `tuto-${s.lundi}-2`]);
    await passer(s.t(70));
    await passer(s.t(140));
    expect(appels("usine/tutoriels")).toHaveLength(2);
    expect((await lignes(s.lundi)).map((x) => x.etat_studio)).toEqual(["a_revoir", "en_reserve"]);
    expect(appels("usine/commandes")).toHaveLength(0);
  });

  /** Un tirage `pris` puis « à valider » : créneau posé et commande envoyée ; rend la semaine et la ligne. */
  const jusquALaPose = async (videoId: string) => {
    const s = semaine();
    tirage = { etat: "pris", elementId: "el-1" };
    suivi = { etat: "pris", elementId: "el-1", aValider: false };
    await passer(s.t());
    suivi = { etat: "fait", elementId: "el-1", videoId, aValider: true };
    await passer(s.t(31));
    const t = (await lignes(s.lundi)).find((x) => !x.archive_le); // R4 laisse des tirages archivés sur des semaines plus tardives
    expect(t.calendrier_ligne).not.toBeNull();
    return { s, cle: t.cle as string, ligne: t.calendrier_ligne as string };
  };
  const suivis = (cle: string) => appels(`usine/tutoriels/${cle}`).length;

  it("R1 · le suivi relit la clé après la pose, jusqu'à `prevue_le` ; `a_revoir` ou `refusee` : le créneau est retiré (archivé) et écrit au journal", async () => {
    for (const etat of ["a_revoir", "refusee"]) {
      const { s, cle, ligne } = await jusquALaPose(`vid-r1-${etat}`);
      const avant = suivis(cle);
      await passer(s.t(62)); // toujours « à valider » : relu une fois, rien ne bouge
      expect(suivis(cle)).toBe(avant + 1);
      expect((await p.query("SELECT archive_le FROM calendrier_ligne WHERE id = $1", [ligne])).rows[0].archive_le).toBeNull();
      suivi = { etat, elementId: "el-1", aValider: false };
      await passer(s.t(93));
      const [t] = await lignes(s.lundi);
      expect(t.etat_studio).toBe("a_revoir");
      expect((await p.query("SELECT archive_le FROM calendrier_ligne WHERE id = $1", [ligne])).rows[0].archive_le).not.toBeNull();
      const j = await p.query("SELECT donnees FROM journal WHERE sujet = 'tutoriel' AND cible = $1 AND message LIKE '%retiré%'", [cle]);
      expect(j.rows).toHaveLength(1);
      expect((await p.query("SELECT count(*)::int AS n FROM tutoriel_tirage WHERE cle = $1", [cle])).rows[0].n).toBe(1); // rien de supprimé
    }
  });

  it("R1 · après `prevue_le`, plus aucune relecture ; une relecture « à valider » ne réécrit ni la date ni le journal", async () => {
    const { s, cle, ligne } = await jusquALaPose("vid-r1-borne");
    const [avant] = await lignes(s.lundi);
    await passer(s.t(62));
    const [apres] = await lignes(s.lundi);
    expect(apres.a_valider_le.getTime()).toBe(avant.a_valider_le.getTime());
    expect((await p.query("SELECT count(*)::int AS n FROM journal WHERE sujet = 'tutoriel' AND cible = $1 AND message LIKE '%prêt à être validé%'", [cle])).rows[0].n).toBe(1);
    const vu = suivis(cle);
    await p.query("UPDATE calendrier_ligne SET prevue_le = $2 WHERE id = $1", [ligne, new Date(s.t(100).getTime() - 3_600_000)]);
    await passer(s.t(100));
    expect(suivis(cle)).toBe(vu);
  });

  it("R2 · la ligne du tutoriel a `date_choisie = true` : l'horloge de la semaine ne la déplace pas", async () => {
    const { ligne } = await jusquALaPose("vid-r2");
    const [l] = (await p.query("SELECT date_choisie FROM calendrier_ligne WHERE id = $1", [ligne])).rows;
    expect(l.date_choisie).toBe(true);
  });

  it("R4 · une commande refusée (400) n'est pas renvoyée à chaque passage : pause croissante, arrêt après 6 envois, une ligne claire au journal", async () => {
    const s = semaine();
    let cleR4 = "";
    const commandesR4 = () => appels("usine/commandes").filter((c) => (c[1] as { cle: string }).cle === cleR4);
    appelerStudio.mockImplementation(async (chemin: string) => {
      if (chemin === "usine/tutoriels") return { envoye: true, statut: 200, corps: tirage };
      if (chemin.startsWith("usine/tutoriels/")) return { envoye: true, statut: 200, corps: suivi };
      if (chemin === "usine/commandes") return { envoye: true, statut: 400, corps: { erreur: "refus" } };
      throw new Error(`chemin inattendu ${chemin}`);
    });
    tirage = { etat: "pris", elementId: "el-1" };
    await passer(s.t());
    suivi = { etat: "fait", elementId: "el-1", videoId: "vid-r4", aValider: true };
    await passer(s.t(31));
    cleR4 = (appels("usine/commandes")[0][1] as { cle: string }).cle;
    expect(commandesR4()).toHaveLength(1);
    await passer(s.t(62)); // moins d'une heure après : pause
    await passer(s.t(85));
    expect(commandesR4()).toHaveLength(1);
    await passer(s.t(31 + 61)); // 1 h après : deuxième envoi
    expect(commandesR4()).toHaveLength(2);
    await passer(s.t(31 + 61 + 90)); // la pause a doublé (2 h)
    expect(commandesR4()).toHaveLength(2);
    for (let i = 1; i <= 40; i++) await passer(s.t(31 + 61 + 24 * 60 * i / 4));
    expect(commandesR4()).toHaveLength(6);
    const j = await p.query("SELECT 1 FROM journal WHERE sujet = 'tutoriel' AND cible = $1 AND message LIKE '%plus renvoyée%'", [`tuto-${s.lundi}-1`]);
    expect(j.rowCount).toBe(1);
    rang += 3; // les 10 jours de passages ci-dessus ont créé des tirages sur les semaines suivantes : les essais suivants prennent des semaines plus loin
  });

  it("R1bis · erreurs passagères (503 puis 429) : rejouées sans compter ni abandonner ; la commande part au retour du Studio ; un 400 répété s'arrête après 6 essais", async () => {
    const s = semaine();
    let statutCommande = 503;
    appelerStudio.mockImplementation(async (chemin: string) => {
      if (chemin === "usine/tutoriels") return { envoye: true, statut: 200, corps: tirage };
      if (chemin.startsWith("usine/tutoriels/")) return { envoye: true, statut: 200, corps: suivi };
      if (chemin === "usine/commandes") return { envoye: true, statut: statutCommande, corps: statutCommande === 200 ? { etat: "recue", deja: false } : { erreur: "x" } };
      throw new Error(`chemin inattendu ${chemin}`);
    });
    tirage = { etat: "pris", elementId: "el-1" };
    await passer(s.t());
    suivi = { etat: "fait", elementId: "el-1", videoId: "vid-pass", aValider: true };
    await passer(s.t(31)); // 503
    statutCommande = 429;
    await passer(s.t(62)); // 429
    for (let i = 1; i <= 20; i++) await passer(s.t(62 + 31 * i)); // beaucoup de passages : jamais abandonnée
    const t = (await lignes(s.lundi)).find((x) => !x.archive_le);
    expect(t.commande_essais).toBe(0);
    expect(appels("usine/commandes").length).toBeGreaterThan(6);
    expect((await p.query("SELECT 1 FROM journal WHERE sujet = 'tutoriel' AND cible = $1 AND message LIKE '%plus renvoyée%'", [t.cle])).rowCount).toBe(0);
    statutCommande = 200; // le Studio revient
    await passer(s.t(62 + 31 * 22));
    expect((await p.query("SELECT etat_envoi FROM commande_studio WHERE calendrier_ligne = $1 AND archive_le IS NULL", [t.calendrier_ligne])).rows[0].etat_envoi).toBe("envoyee");
  });

  it("R2bis · quand le créneau est retiré, sa commande est archivée aussi (plus comptée au quota), rien n'est supprimé", async () => {
    const { s, ligne } = await jusquALaPose("vid-r2bis");
    expect((await p.query("SELECT count(*)::int AS n FROM commande_studio WHERE calendrier_ligne = $1 AND archive_le IS NULL", [ligne])).rows[0].n).toBe(1);
    suivi = { etat: "a_revoir", elementId: "el-1", aValider: false };
    await passer(s.t(93));
    const c = (await p.query("SELECT archive_le FROM commande_studio WHERE calendrier_ligne = $1", [ligne])).rows;
    expect(c).toHaveLength(1);
    expect(c[0].archive_le).not.toBeNull();
  });

  it("R5 · la pose seule, sans le verrou consultatif : deux poses simultanées donnent une seule ligne (le `FOR UPDATE` tient)", async () => {
    const s = semaine();
    tirage = { etat: "pris", elementId: "el-1" };
    await passer(s.t());
    // Le suivi pose `a_valider_le` ; la pose est ensuite appelée directement, deux fois à la fois.
    await p.query("UPDATE tutoriel_tirage SET a_valider_le = $2, video_id = 'vid-r5', etat_studio = 'fait' WHERE lundi = $1 AND archive_le IS NULL", [s.lundi, s.t(31)]);
    const { poser } = await import("@/tutoriels");
    const a: string[] = [];
    const b: string[] = [];
    await Promise.all([poser(s.t(31), a), poser(s.t(31), b)]);
    expect([...a, ...b].filter((x) => x === "pose")).toHaveLength(1);
    const [t] = await lignes(s.lundi);
    expect((await p.query("SELECT count(*)::int AS n FROM calendrier_ligne WHERE note = 'Tutoriel de la réserve' AND id = $1", [t.calendrier_ligne])).rows[0].n).toBe(1);
  });

  it("T13 · route `POST /api/horloge/tutoriels` : sans secret ou secret faux, 401 sans détail, aucun appel ; avec le secret, un passage", async () => {
    process.env.USINE_HORLOGE_SECRET = SECRET;
    const { POST } = await import("@/app/api/horloge/tutoriels/route");
    const post = (auth: string | null) => new Request("http://localhost/api/horloge/tutoriels", { method: "POST", headers: auth === null ? {} : { authorization: auth } });
    for (const auth of [null, "Bearer faux", `Basic ${SECRET}`]) {
      const r = await POST(post(auth));
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ erreur: "Accès refusé." });
    }
    expect(appelerStudio).not.toHaveBeenCalled();
    await regler("tutoriel.reserve", false);
    const ok = await POST(post(`Bearer ${SECRET}`));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ fait: ["eteint"] });
    delete process.env.USINE_HORLOGE_SECRET;
  });
});
