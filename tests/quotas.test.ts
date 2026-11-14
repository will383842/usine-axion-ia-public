/** U-QUOTA · quotas de production en quantités : fonctions pures, corps de la porte sans montant, relecture. */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESEAUX } from "@/contrats";
import {
  QUOTAS_DEFAUT,
  TYPES_QUOTA,
  alerteQuota,
  corpsCommande,
  corpsCommandeSchema,
  debloquer,
  decider,
  projeter,
  quotasParReseau,
  repartir,
  verifierQuota,
} from "@/reglages/quotas";

describe("valeurs de départ", () => {
  it("vidéo 1 par jour (Instagram 2), carrousel 1 par semaine, infographie 2 par semaine", () => {
    const q = quotasParReseau(null);
    for (const r of RESEAUX) {
      expect(q[r].video).toEqual({ periode: "jour", quantite: r === "instagram" ? 2 : 1 });
      expect(q[r].carrousel).toEqual({ periode: "semaine", quantite: 1 });
      expect(q[r].image).toEqual({ periode: "semaine", quantite: 2 });
    }
    expect(QUOTAS_DEFAUT.instagram.video.quantite).toBeGreaterThanOrEqual(2);
    expect(QUOTAS_DEFAUT.instagram.video.quantite).toBeLessThanOrEqual(5);
  });

  it("une valeur relue invalide retombe sur la valeur de départ, une valeur valide est gardée (jour ou semaine, jamais mois)", () => {
    const q = quotasParReseau({ linkedin: { video: { periode: "semaine", quantite: 3 }, carrousel: { periode: "mois", quantite: 4 }, image: { periode: "jour", quantite: -1 } } });
    expect(q.linkedin.video).toEqual({ periode: "semaine", quantite: 3 });
    expect(q.linkedin.carrousel).toEqual(QUOTAS_DEFAUT.linkedin.carrousel);
    expect(q.linkedin.image).toEqual(QUOTAS_DEFAUT.linkedin.image);
    expect(verifierQuota({ periode: "mois" as never, quantite: 1 })).not.toBeNull();
    expect(verifierQuota({ periode: "jour", quantite: 1.5 })).not.toBeNull();
    expect(verifierQuota({ periode: "jour", quantite: 0 })).toBeNull();
    expect(verifierQuota({ periode: "semaine", quantite: 4 })).toBeNull();
  });
});

describe("projection et alertes à 50, 80 et 100 %", () => {
  const quota = { periode: "semaine", quantite: 10 } as const;
  it("les paliers tombent à 50, 80 et 100 %, pas avant", () => {
    expect(alerteQuota(quota, 4)).toBe(0);
    expect(alerteQuota(quota, 5)).toBe(50);
    expect(alerteQuota(quota, 7)).toBe(50);
    expect(alerteQuota(quota, 8)).toBe(80);
    expect(alerteQuota(quota, 9)).toBe(80);
    expect(alerteQuota(quota, 10)).toBe(100);
    expect(alerteQuota(quota, 14)).toBe(100);
  });
  it("une quantité de zéro est déjà à 100 %", () => {
    expect(alerteQuota({ periode: "jour", quantite: 0 }, 0)).toBe(100);
  });
  it("projette le reste et le pourcentage", () => {
    expect(projeter(quota, 8, 1)).toMatchObject({ fait: 8, reste: 2, pourcentage: 80, apres: 9, palier_apres: 80 });
    expect(projeter(quota, 9, 3)).toMatchObject({ reste: 1, apres: 12, depassement: 2, palier_apres: 100 });
  });
});

describe("au-delà de 100 % : mise de côté, jamais refus ni perte", () => {
  const quota = { periode: "jour", quantite: 1 } as const;
  it("une commande automatique qui dépasse est mise de côté, jamais refusée", () => {
    expect(decider(quota, 0, 1, "automatique").decision).toBe("passe");
    const d = decider(quota, 1, 1, "automatique");
    expect(d.decision).toBe("mise_de_cote");
    expect(d.quantite).toBe(1);
  });
  it("une commande faite à la main n'est JAMAIS bloquée, même très au-delà", () => {
    for (const fait of [0, 1, 5, 500]) expect(decider(quota, fait, 50, "main").decision).toBe("passe");
  });
  it("la répartition ne perd rien : passe + mises de côté = demandé", () => {
    const r = repartir({ periode: "semaine", quantite: 4 }, 1, [{ id: "a", quantite: 1 }, { id: "b", quantite: 2 }, { id: "c", quantite: 1 }], "automatique");
    expect(r.passent.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.misesDeCote.map((x) => x.id)).toEqual(["c"]);
    expect(r.passent.length + r.misesDeCote.length).toBe(3);
    const main = repartir({ periode: "semaine", quantite: 3 }, 9, [{ id: "a", quantite: 4 }], "main");
    expect(main.misesDeCote).toEqual([]);
  });
  it("une mise de côté se débloque d'un clic et repart telle quelle", () => {
    const m = { id: "c", quantite: 1, etat: "mise_de_cote" as const };
    expect(debloquer(m)).toEqual({ id: "c", quantite: 1, etat: "debloquee" });
    expect(debloquer({ ...m, etat: "debloquee" })).toEqual({ id: "c", quantite: 1, etat: "debloquee" });
  });
});

describe("corps prêt pour la porte : des quantités, aucun montant", () => {
  const interdit = /eur|euro|cent|prix|montant|tarif|cout|coût|€/i;
  it("le schéma n'a aucun champ en euros ni en centimes", () => {
    const cles = Object.keys(corpsCommandeSchema.shape);
    expect(cles.length).toBeGreaterThan(0);
    expect(cles.filter((c) => interdit.test(c))).toEqual([]);
  });
  it("le schéma refuse un champ en plus, montant compris", () => {
    const corps = corpsCommande("instagram", "video", { periode: "jour", quantite: 2 });
    expect(corpsCommandeSchema.safeParse(corps).success).toBe(true);
    expect(corpsCommandeSchema.safeParse({ ...corps, plafond_eur: 40 }).success).toBe(false);
    expect(corpsCommandeSchema.safeParse({ ...corps, centimes: 100 }).success).toBe(false);
    expect(Object.keys(corps).filter((c) => interdit.test(c))).toEqual([]);
    expect(corps).toEqual({ reseau: "instagram", type_contenu: "video", quantite: 2, periode: "jour" });
  });
  it("chaque type de quota est un type de contenu connu", () => {
    expect(TYPES_QUOTA).toEqual(["video", "carrousel", "image"]);
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
const nouveauPool = () => new Pool({ connectionString: url, options: `-c search_path=${schema}` });

describe.skipIf(!url)("relecture après redémarrage", () => {
  let p: Pool;
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = nouveauPool();
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

  it("les quotas enregistrés se relisent tels quels, même avec une connexion neuve, et se modifient à tout moment", async () => {
    const { ecrireReglage } = await import("@/donnees");
    const { CLE_QUOTAS, lireQuotas } = await import("@/reglages");
    const { utiliserPool } = await import("@/lib/base");
    const base = quotasParReseau(null);
    expect((await lireQuotas()).tiktok.video).toEqual(QUOTAS_DEFAUT.tiktok.video);
    await ecrireReglage(CLE_QUOTAS, { ...base, tiktok: { ...base.tiktok, video: { periode: "semaine", quantite: 4 } } });
    // Redémarrage : le pool est remplacé par une connexion neuve, rien ne reste en mémoire.
    const neuf = nouveauPool();
    utiliserPool(neuf);
    expect((await lireQuotas()).tiktok.video).toEqual({ periode: "semaine", quantite: 4 });
    await ecrireReglage(CLE_QUOTAS, { ...base, tiktok: { ...base.tiktok, video: { periode: "jour", quantite: 2 } } });
    expect((await lireQuotas()).tiktok.video).toEqual({ periode: "jour", quantite: 2 });
    utiliserPool(p);
    await neuf.end();
  });
});
