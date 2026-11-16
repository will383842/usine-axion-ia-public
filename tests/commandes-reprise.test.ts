/** U-REPRISE · reprise d'une commande interrompue et rejeu sans doublon. Aucun appel réel : la passerelle est une doublure. */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const appelerStudio = vi.fn();
vi.mock("@/passerelles/studio", () => ({ appelerStudio: (...a: unknown[]) => appelerStudio(...a) }));

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("reprise des commandes · en base, avec une doublure du Studio", () => {
  const regler = (code: string, allume: boolean) => p.query("UPDATE interrupteur SET allume = $2 WHERE code = $1", [code, allume]);
  const nouvelleLigne = async (prevue = "2099-12-10T08:30:00Z", archivee = false) => {
    await p.query(`INSERT INTO compte (code, reseau, identifiant, nature, nom) VALUES ('linkedin:compte-fictif-1', 'linkedin', 'compte-fictif-1', 'page', 'Compte fictif') ON CONFLICT DO NOTHING`);
    const r = await p.query(
      `INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le, archive_le) VALUES ('linkedin', 'linkedin:compte-fictif-1', 'video', $1, $2) RETURNING id::text`,
      [prevue, archivee ? new Date() : null],
    );
    return r.rows[0].id as string;
  };
  /** Pose une commande dans l'état voulu, comme si le processus s'était arrêté à cet endroit. */
  const commandeDans = async (etat: string, ligne: string, vieille = true) => {
    const { cleCommande } = await import("@/commandes/regles");
    const cle = cleCommande(ligne);
    await p.query(
      `INSERT INTO commande_studio (cle, calendrier_ligne, reseau, compte, type_contenu, jour, instant, etat_envoi, modifie_le)
       VALUES ($1, $2, 'linkedin', 'linkedin:compte-fictif-1', 'video', '2099-12-10', '2099-12-10T08:30:00Z', $3, now() - $4::interval)`,
      [cle, ligne, etat, vieille ? "1 hour" : "0 seconds"],
    );
    return cle;
  };
  const lire = async (cle: string) => (await p.query("SELECT etat_envoi, message FROM commande_studio WHERE cle = $1", [cle])).rows[0];
  const journal = async (cle: string) => (await p.query("SELECT message FROM journal WHERE sujet = 'commande' AND cible = $1 ORDER BY id", [cle])).rows.map((r) => r.message as string);
  /** Vraie coupure : le Studio ne répond pas pendant la proposition, la commande reste « sans réponse ». */
  const coupee = async (ligne: string) => {
    const { proposerAuStudio } = await import("@/commandes/service");
    appelerStudio.mockRejectedValueOnce(new Error("coupure"));
    const r = await proposerAuStudio(ligne);
    expect(r.etat_envoi).toBe("non_envoyee");
    const { cleCommande } = await import("@/commandes/regles");
    const cle = cleCommande(ligne);
    await p.query("UPDATE commande_studio SET modifie_le = now() - interval '1 hour' WHERE cle = $1", [cle]);
    appelerStudio.mockClear();
    return cle;
  };

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
    await p.query("UPDATE commande_studio SET archive_le = now() WHERE archive_le IS NULL");
    appelerStudio.mockReset();
    appelerStudio.mockResolvedValue({ envoye: true, statut: 201, corps: { etat: "recue", deja: false } });
    await regler("commandes.studio", true);
    await regler("arret.tout", false);
  });

  it("éteint : aucune reprise, aucun appel", async () => {
    const { reprendreCommande } = await import("@/commandes/reprise");
    const cle = await coupee(await nouvelleLigne());
    await regler("commandes.studio", false);
    const r = await reprendreCommande(cle);
    expect(r.message).toBe("Les échanges avec le Studio sont éteints.");
    expect(appelerStudio).not.toHaveBeenCalled();
    expect((await lire(cle)).etat_envoi).toBe("non_envoyee");
  });

  it("coupée sans réponse du Studio : reprise à l'envoi avec la même clé, journal exact", async () => {
    const { reprendreCommande } = await import("@/commandes/reprise");
    const cle = await coupee(await nouvelleLigne());
    const avant = (await journal(cle)).length;
    const r = await reprendreCommande(cle);
    expect(r.issue).toBe("reprise");
    expect(appelerStudio).toHaveBeenCalledTimes(1);
    expect((await lire(cle)).etat_envoi).toBe("envoyee");
    expect((await journal(cle)).slice(avant)).toEqual(["Une ligne du calendrier a été proposée au Studio.", "Une commande interrompue a été reprise."]);
  });

  it("restée « à envoyer » : reprise aussi", async () => {
    const { reprendreCommande } = await import("@/commandes/reprise");
    const cle = await commandeDans("a_envoyer", await nouvelleLigne());
    expect((await reprendreCommande(cle)).issue).toBe("reprise");
    expect((await lire(cle)).etat_envoi).toBe("envoyee");
  });

  it("coupée puis devenue impossible (ligne archivée, date passée) : s'annule proprement, sans appel", async () => {
    const { reprendreCommande } = await import("@/commandes/reprise");
    const archivee = await commandeDans("a_envoyer", await nouvelleLigne("2099-12-10T08:30:00Z", true));
    const passee = await commandeDans("a_envoyer", await nouvelleLigne("2000-01-01T00:00:00Z"));
    for (const cle of [archivee, passee]) {
      const r = await reprendreCommande(cle);
      expect(r.issue).toBe("annulee");
      expect((await lire(cle)).etat_envoi).toBe("non_envoyee");
      expect((await lire(cle)).message).toBeTruthy();
      expect(await journal(cle)).toEqual(["Une commande interrompue a été annulée : elle ne peut plus partir."]);
    }
    expect(appelerStudio).not.toHaveBeenCalled();
  });

  it("déjà envoyée ou mise de côté : rien n'est refait, une ligne au journal", async () => {
    const { reprendreCommande } = await import("@/commandes/reprise");
    for (const etat of ["envoyee", "mise_de_cote_studio"]) {
      const cle = await commandeDans(etat, await nouvelleLigne());
      const r = await reprendreCommande(cle);
      expect(r.issue).toBe("deja_envoyee");
      expect((await lire(cle)).etat_envoi).toBe(etat);
      expect(await journal(cle)).toEqual(["Une commande déjà proposée au Studio n'a pas été renvoyée."]);
    }
    expect(appelerStudio).not.toHaveBeenCalled();
  });

  it("refusée par le Studio (non envoyée pour un autre motif) : laissée telle quelle, une ligne au journal", async () => {
    const { reprendreCommande } = await import("@/commandes/reprise");
    const cle = await commandeDans("non_envoyee", await nouvelleLigne());
    await p.query("UPDATE commande_studio SET message = 'Le Studio a refusé cette demande : vérifiez le réseau, le compte et la date.' WHERE cle = $1", [cle]);
    const r = await reprendreCommande(cle);
    expect(r.issue).toBe("rien");
    expect(appelerStudio).not.toHaveBeenCalled();
    expect(await journal(cle)).toEqual(["Une commande non envoyée est laissée telle quelle : à relancer depuis le calendrier."]);
  });

  it("commande inconnue : phrase claire, aucun appel", async () => {
    const { reprendreCommande } = await import("@/commandes/reprise");
    const r = await reprendreCommande("0".repeat(64));
    expect(r).toEqual({ issue: "rien", message: "Cette commande n'existe plus." });
    expect(appelerStudio).not.toHaveBeenCalled();
  });

  it("reprise qui échoue encore : pas comptée comme reprise, journal « n'a pas pu », reste reprenable", async () => {
    const { reprendreCommande, reprendreInterrompues } = await import("@/commandes/reprise");
    const cle = await coupee(await nouvelleLigne());
    appelerStudio.mockRejectedValueOnce(new Error("coupure"));
    const r = await reprendreCommande(cle);
    expect(r.issue).toBe("rien");
    expect((await journal(cle)).pop()).toBe("Une commande interrompue n'a pas pu être reprise.");
    expect((await lire(cle)).etat_envoi).toBe("non_envoyee");
    await p.query("UPDATE commande_studio SET modifie_le = now() - interval '1 hour' WHERE cle = $1", [cle]);
    appelerStudio.mockRejectedValueOnce(new Error("coupure"));
    expect((await reprendreInterrompues()).reprises).toBe(0);
  });

  it("rejeu sans doublon : même cle_commande, un seul envoi, une seule ligne, même répétée ou après un envoi normal", async () => {
    const { reprendreCommande, reprendreInterrompues } = await import("@/commandes/reprise");
    const { proposerAuStudio } = await import("@/commandes/service");
    const ligne = await nouvelleLigne();
    const cle = await coupee(ligne);
    await reprendreCommande(cle);
    await reprendreCommande(cle);
    await reprendreInterrompues();
    await proposerAuStudio(ligne);
    expect(appelerStudio).toHaveBeenCalledTimes(1);
    const { rows } = await p.query("SELECT cle FROM commande_studio WHERE calendrier_ligne = $1", [ligne]);
    expect(rows).toEqual([{ cle }]);
  });

  it("le passage général ne reprend que les anciennes commandes en doute", async () => {
    const { reprendreInterrompues } = await import("@/commandes/reprise");
    const ancienne = await coupee(await nouvelleLigne());
    const recente = await commandeDans("a_envoyer", await nouvelleLigne(), false);
    const r = await reprendreInterrompues();
    expect(r.reprises).toBe(1);
    expect((await lire(ancienne)).etat_envoi).toBe("envoyee");
    expect((await lire(recente)).etat_envoi).toBe("a_envoyer");
  });

  it("« Tout arrêter » : rien ne part, la commande reste exactement dans son état et reprenable", async () => {
    const { reprendreCommande } = await import("@/commandes/reprise");
    const cle = await coupee(await nouvelleLigne());
    const avant = await lire(cle);
    await regler("arret.tout", true);
    const r = await reprendreCommande(cle);
    expect(r).toEqual({ issue: "rien", message: "Tout est arrêté." });
    expect(appelerStudio).not.toHaveBeenCalled();
    expect(await lire(cle)).toEqual(avant);
    await regler("arret.tout", false);
    expect((await reprendreCommande(cle)).issue).toBe("reprise");
  });
});
