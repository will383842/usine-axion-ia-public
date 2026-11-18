/**
 * UO-04 · écrans de suivi (Fiabilité, Formats sans vidéo, Vidéos sur le site, Prospects, STOP et opposition).
 * Données fictives, aucun appel réseau. Les essais de base exigent DATABASE_URL (PostgreSQL 16) ; sans elle, ils sont sautés.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { motsInterditsDans } from "@/lib/lexique";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";

vi.mock("@/services/auth", () => ({ exigerSession: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/", redirect: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;
const requetes: string[] = [];
const PRENOM_FONDATEUR = new RegExp(["Wil", "liams|\\bWi", "ll\\b"].join(""));

async function resoudre(n: ReactNode): Promise<ReactNode> {
  if (Array.isArray(n)) return Promise.all(n.map(resoudre));
  if (!isValidElement(n)) return n;
  const el = n as { type: unknown; props: Record<string, unknown>; key: string | null };
  if (typeof el.type === "function" && Object.prototype.toString.call(el.type) === "[object AsyncFunction]") {
    return resoudre(await (el.type as (props: unknown) => Promise<ReactNode>)(el.props));
  }
  const enfants = el.props.children as ReactNode;
  const { children: _enfants, ...reste } = el.props;
  void _enfants;
  const resolus = enfants === undefined ? undefined : await resoudre(enfants);
  const React = await import("react");
  return Array.isArray(resolus)
    ? React.createElement(el.type as string, { ...reste, key: el.key ?? undefined }, ...resolus)
    : React.createElement(el.type as string, { ...reste, key: el.key ?? undefined }, resolus);
}

type Page = { default: (p: unknown) => Promise<ReactNode> };
async function rendre(charger: () => Promise<Page>): Promise<string> {
  const page = await charger();
  return renderToStaticMarkup((await resoudre(await page.default({}))) as React.ReactElement);
}

const ECRANS = [
  { nom: "Suivi", fichier: "src/app/suivi/page.tsx", charger: () => import("../src/app/suivi/page") },
  { nom: "Fiabilité", fichier: "src/app/suivi/fiabilite/page.tsx", charger: () => import("../src/app/suivi/fiabilite/page") },
  { nom: "Formats sans vidéo", fichier: "src/app/suivi/formats-sans-video/page.tsx", charger: () => import("../src/app/suivi/formats-sans-video/page") },
  { nom: "Vidéos sur le site", fichier: "src/app/suivi/site/page.tsx", charger: () => import("../src/app/suivi/site/page") },
  { nom: "Prospects", fichier: "src/app/suivi/prospects/page.tsx", charger: () => import("../src/app/suivi/prospects/page") },
  { nom: "STOP et opposition", fichier: "src/app/suivi/stop/page.tsx", charger: () => import("../src/app/suivi/stop/page") },
] as const;

describe("règles pures", () => {
  it("une donnée absente se dit « pas encore de donnée », jamais 0", async () => {
    const { libelleDate, libelleNombre, PAS_ENCORE } = await import("@/suivi/regles");
    expect(PAS_ENCORE).toBe("pas encore de donnée");
    expect(libelleDate(null)).toBe(PAS_ENCORE);
    expect(libelleDate(new Date("2026-11-10T08:00:00Z"))).toBe("10 novembre 2026");
    expect(libelleNombre(null)).toBe(PAS_ENCORE);
    expect(libelleNombre(12)).toBe("12");
  });
  it("totaux par réseau : une cellule masquée n'est jamais comptée comme zéro", async () => {
    const { totauxParReseau } = await import("@/suivi/regles");
    const t = totauxParReseau([
      { reseau: "instagram", demandes: 5, guides_envoyes: 4, accords: null },
      { reseau: "instagram", demandes: 3, guides_envoyes: null, accords: null },
      { reseau: "facebook", demandes: null, guides_envoyes: null, accords: null },
    ]);
    const insta = t.find((x) => x.reseau === "instagram")!;
    expect(insta.demandes).toEqual({ somme: 8, masquee: false });
    expect(insta.guides_envoyes).toEqual({ somme: 4, masquee: true });
    expect(insta.accords).toEqual({ somme: null, masquee: true });
    expect(t.find((x) => x.reseau === "facebook")!.demandes).toEqual({ somme: null, masquee: true });
  });
});

describe("fichiers des écrans (dépôt public)", () => {
  it("aucun prénom du fondateur, aucun mot interdit à l'écran, aucun montant, aucune suppression", () => {
    for (const e of ECRANS) {
      const t = readFileSync(e.fichier, "utf8");
      expect(t, e.fichier).not.toMatch(PRENOM_FONDATEUR);
      expect(t, e.fichier).not.toMatch(/€|\beuros?\b/i);
    }
    for (const f of ["src/suivi/index.ts", "src/suivi/regles.ts", "src/app/suivi/site/actions.ts", "migrations/039-sur-le-site.sql"]) {
      const t = readFileSync(f, "utf8");
      expect(t, f).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
    }
  });
});

describe.skipIf(!url)("écrans de suivi · base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const brut = p.query.bind(p) as (...a: unknown[]) => unknown;
    (p as unknown as { query: unknown }).query = (texte: unknown, ...reste: unknown[]) => {
      requetes.push(typeof texte === "string" ? texte : String((texte as { text?: string }).text));
      return brut(texte, ...reste);
    };
    utiliserPool(p);
    await jouerMigrations(p);
  });
  afterAll(async () => {
    await p?.end();
  });

  it("la migration ajoute les deux colonnes (ajout seul) et l'interrupteur « suivi », éteint", async () => {
    const c = await p.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'lot_ligne' AND column_name IN ('sur_le_site', 'sur_le_site_retire_le')", [schema]);
    expect(c.rows).toHaveLength(2);
    const i = await p.query("SELECT allume FROM interrupteur WHERE code = 'suivi'");
    expect(i.rows).toEqual([{ allume: false }]);
    const v = await p.query("SELECT allume FROM interrupteur WHERE code = 'veille'");
    expect(v.rows).toEqual([{ allume: false }]);
  });

  it("éteint : les six pages disent qu'elles sont éteintes et ne lisent aucune donnée", async () => {
    requetes.length = 0;
    for (const e of ECRANS) {
      const html = await rendre(e.charger as () => Promise<Page>);
      expect(html, e.nom).toMatch(/éteint/);
      expect(html, e.nom).toContain("/reglages/interrupteurs");
    }
    expect(requetes.filter((q) => /lot_ligne|opposition|agregat_crm|commande_studio|calendrier_ligne/.test(q) && !/interrupteur/.test(q))).toEqual([]);
  });

  describe("allumé", () => {
    beforeAll(async () => {
      await p.query("UPDATE interrupteur SET allume = true WHERE code IN ('suivi', 'veille')");
      await p.query("INSERT INTO lot (id, numero, nombre, plafond_eur) VALUES ('L1', 1, 3, 100)");
      await p.query(
        `INSERT INTO lot_ligne (id, lot, rang, type_contenu, repere, etat) VALUES
         ('L1-1', 'L1', 1, 'video', 'usine:L1-1', 'fabriquee'),
         ('L1-2', 'L1', 2, 'video', 'usine:L1-2', 'publiee'),
         ('L1-3', 'L1', 3, 'carrousel', 'usine:L1-3', 'publiee'),
         ('L1-4', 'L1', 4, 'image', 'usine:L1-4', 'a_coller'),
         ('L1-5', 'L1', 5, 'texte', 'usine:L1-5', 'a_coller')`,
      );
    });

    it("aucune écriture à l'affichage des six pages", async () => {
      requetes.length = 0;
      for (const e of ECRANS) await rendre(e.charger as () => Promise<Page>);
      expect(requetes.filter((q) => /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)/i.test(q))).toEqual([]);
      const lignes = await p.query("SELECT sur_le_site, sur_le_site_retire_le FROM lot_ligne");
      expect(lignes.rows.every((l) => l.sur_le_site === false && l.sur_le_site_retire_le === null)).toBe(true);
    });

    it("aucun mot interdit, aucun prénom, dans les six pages rendues", async () => {
      for (const e of ECRANS) {
        const html = await rendre(e.charger as () => Promise<Page>);
        const texte = html.replace(/<[^>]+>/g, " ");
        expect(motsInterditsDans(texte), e.nom).toEqual([]);
        expect(texte, e.nom).not.toMatch(PRENOM_FONDATEUR);
      }
    });

    it("Fiabilité : aucune alerte ni donnée → « pas encore de donnée », jamais 0", async () => {
      const html = await rendre(ECRANS[1].charger as () => Promise<Page>);
      expect(html).toContain("pas encore de donnée");
      expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/(^|\s)0(\s|$)/);
    });

    it("Fiabilité : une semaine non proposée depuis plus de 24 h s'affiche, avec la date du dernier relevé", async () => {
      await p.query(
        `INSERT INTO calendrier_ligne (reseau, type_contenu, prevue_le, cree_le) VALUES ('linkedin', 'video', now() + interval '2 days', now() - interval '3 days')`,
      );
      await p.query(
        `INSERT INTO agregat_crm (jour, compte, mot, reseau, demandes, genere_le) VALUES (current_date - 1, 'compte-a', 'GUIDE', 'instagram', 5, '2026-11-10T08:00:00Z')`,
      );
      const html = await rendre(ECRANS[1].charger as () => Promise<Page>);
      expect(html).toContain("Proposer la semaine");
      expect(html).toContain("10 novembre 2026");
    });

    it("Fiabilité : veille éteinte → on le dit, aucune alerte inventée", async () => {
      await p.query("UPDATE interrupteur SET allume = false WHERE code = 'veille'");
      const html = await rendre(ECRANS[1].charger as () => Promise<Page>);
      expect(html).not.toContain("Proposer la semaine");
      expect(html).toMatch(/surveillance.*éteinte|éteinte.*surveillance/i);
      await p.query("UPDATE interrupteur SET allume = true WHERE code = 'veille'");
    });

    it("Formats sans vidéo : seulement les lignes qui ne sont pas des vidéos, par état", async () => {
      const { lireFormatsSansVideo } = await import("@/suivi");
      const par = await lireFormatsSansVideo();
      expect(par.find((x) => x.etat === "publiee")?.nombre).toBe(1);
      expect(par.find((x) => x.etat === "a_coller")?.nombre).toBe(2);
      expect(par.find((x) => x.etat === "fabriquee")?.nombre).toBe(0);
      const html = await rendre(ECRANS[2].charger as () => Promise<Page>);
      expect(html).toContain("Publiés");
      expect(html).toContain("À coller");
    });

    it("Prospects : des nombres par réseau, aucun nom, e-mail ni téléphone", async () => {
      await p.query(
        `INSERT INTO agregat_crm (jour, compte, mot, reseau, demandes, guides_envoyes, accords, genere_le) VALUES
         (current_date - 1, 'marie.dupont', 'GUIDE', 'instagram', 7, 4, NULL, now()),
         (current_date - 2, 'marie.dupont', 'MAIL', 'facebook', NULL, NULL, NULL, now())`,
      );
      const html = await rendre(ECRANS[4].charger as () => Promise<Page>);
      const texte = html.replace(/<[^>]+>/g, " ");
      expect(texte).not.toMatch(/marie|dupont/i);
      expect(html).not.toContain("@");
      expect(texte).not.toMatch(/(\d{2}[ .]){4}\d{2}|\+\d{6,}|\d{10}/);
      expect(texte).toContain("Instagram");
      expect(texte).toMatch(/moins de 3/);
    });

    it("STOP : le nombre par réseau, le lien pour en ajouter, aucune adresse", async () => {
      await p.query(
        `INSERT INTO opposition (cle, canal, source) VALUES
         ('empreinte-secrete-aaa', 'instagram', 'site'), ('empreinte-secrete-bbb', 'instagram', 'will'),
         ('empreinte-secrete-ccc', 'facebook', 'site'), ('empreinte-secrete-ddd', 'email', 'zernio-stop'), ('empreinte-secrete-eee', 'tous', 'will')`,
      );
      const { lireOppositionsParCanal } = await import("@/suivi");
      const n = await lireOppositionsParCanal();
      expect(Object.fromEntries(n.map((x) => [x.canal, x.nombre]))).toEqual({ tous: 1, instagram: 2, facebook: 1, email: 1 });
      const html = await rendre(ECRANS[5].charger as () => Promise<Page>);
      expect(html).toContain('href="/reglages/oppositions"');
      expect(html).not.toContain("empreinte-secrete");
      expect(html).not.toContain("@");
    });

    it("Vidéos sur le site : la case se coche, se décoche, date et journal, rien n'est supprimé", async () => {
      const { surLeSite } = await import("../src/app/suivi/site/actions");
      await surLeSite("L1-1", true);
      let l = (await p.query("SELECT sur_le_site, sur_le_site_retire_le FROM lot_ligne WHERE id = 'L1-1'")).rows[0];
      expect(l).toEqual({ sur_le_site: true, sur_le_site_retire_le: null });
      let html = await rendre(ECRANS[3].charger as () => Promise<Page>);
      expect(html).toContain("L1-1");
      expect(html).not.toContain("L1-3");
      expect(html).toMatch(/checked/);
      await surLeSite("L1-1", false);
      l = (await p.query("SELECT sur_le_site, sur_le_site_retire_le FROM lot_ligne WHERE id = 'L1-1'")).rows[0];
      expect(l.sur_le_site).toBe(false);
      expect(l.sur_le_site_retire_le).toBeInstanceOf(Date);
      const j = await p.query("SELECT message, cible FROM journal WHERE sujet = 'site' ORDER BY id");
      expect(j.rows).toHaveLength(2);
      expect(j.rows[1].cible).toBe("L1-1");
      expect((await p.query("SELECT count(*)::int AS n FROM lot_ligne")).rows[0].n).toBe(5);
      // Une ligne qui n'est pas une vidéo ne se coche pas ; une ligne inconnue ne casse rien.
      await surLeSite("L1-3", true);
      await surLeSite("L9-9", true);
      expect((await p.query("SELECT sur_le_site FROM lot_ligne WHERE id = 'L1-3'")).rows[0].sur_le_site).toBe(false);
      html = await rendre(ECRANS[3].charger as () => Promise<Page>);
      expect(html).toContain("L1-1");
      // Interrupteur « suivi » éteint : l'action ne change rien (ni la ligne, ni le journal).
      await p.query("UPDATE interrupteur SET allume = false WHERE code = 'suivi'");
      const nj = (await p.query("SELECT count(*)::int AS n FROM journal WHERE sujet = 'site'")).rows[0].n;
      await surLeSite("L1-1", true);
      expect((await p.query("SELECT sur_le_site FROM lot_ligne WHERE id = 'L1-1'")).rows[0].sur_le_site).toBe(false);
      expect((await p.query("SELECT count(*)::int AS n FROM journal WHERE sujet = 'site'")).rows[0].n).toBe(nj);
      await p.query("UPDATE interrupteur SET allume = true WHERE code = 'suivi'");
    });
  });
});
