/**
 * UO-02 · écrans v3 du quotidien (Ma journée, Métiers et sujets, Mots et cadeaux, Commenter ailleurs, Réglages).
 * Données fictives, aucun appel réseau. Les essais de base exigent DATABASE_URL (PostgreSQL 16) ; sans elle, ils sont sautés.
 */
import { randomBytes } from "node:crypto";
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

/** Résout les composants serveur asynchrones d'un arbre, puis rend le tout en texte HTML. */
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
async function rendre(charger: () => Promise<Page>, props: Record<string, unknown>): Promise<string> {
  const page = await charger();
  return renderToStaticMarkup((await resoudre(await page.default(props))) as React.ReactElement);
}

const ECRANS = [
  { nom: "Ma journée", charger: () => import("../src/app/(accueil)/page"), props: { searchParams: Promise.resolve({}) } },
  { nom: "Métiers et sujets", charger: () => import("../src/app/sujets/page"), props: { searchParams: Promise.resolve({}) } },
  { nom: "Mots et cadeaux", charger: () => import("../src/app/mots/page"), props: { searchParams: Promise.resolve({}) } },
  { nom: "Commenter ailleurs", charger: () => import("../src/app/commenter/page"), props: {} },
  { nom: "Réglages", charger: () => import("../src/app/reglages/page"), props: {} },
] as const;

describe("aucun prénom du fondateur dans les cinq écrans (dépôt public)", () => {
  it("les fichiers des écrans n'écrivent ni « Williams » ni « Will »", async () => {
    const { readFileSync } = await import("node:fs");
    const fichiers = ["src/app/(accueil)/page.tsx", "src/app/(accueil)/Guide.tsx", "src/app/metiers/EcranMetiers.tsx", "src/app/sujets/page.tsx", "src/app/mots/EcranMots.tsx", "src/app/commenter/page.tsx", "src/app/reglages/page.tsx"];
    for (const f of fichiers) expect(readFileSync(f, "utf8"), f).not.toMatch(/Williams|\bWill\b/);
  });
});

describe.skipIf(!url)("écrans v3 du quotidien · base", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const requeteBrute = p.query.bind(p) as (...a: unknown[]) => unknown;
    (p as unknown as { query: unknown }).query = (texte: unknown, ...reste: unknown[]) => {
      requetes.push(typeof texte === "string" ? texte : String((texte as { text?: string }).text));
      return requeteBrute(texte, ...reste);
    };
    utiliserPool(p);
    await jouerMigrations(p);
  });
  afterAll(async () => {
    await p?.end();
  });

  for (const interrupteurs of [false, true]) {
    describe(interrupteurs ? "interrupteurs allumés" : "interrupteurs éteints (livraison)", () => {
      beforeAll(async () => {
        await p.query("UPDATE interrupteur SET allume = $1", [interrupteurs]);
        requetes.length = 0;
      });
      for (const e of ECRANS) {
        it(`${e.nom} : titre de la maquette, aucune écriture au chargement, ni euro ni « Supprimer » ni mot interdit`, async () => {
          requetes.length = 0;
          const html = await rendre(e.charger as () => Promise<Page>, e.props);
          // « Mots et cadeaux » : le titre est posé par src/app/mots/page.tsx (hors fiche), il reste « Mes mots et cadeaux ».
          if (interrupteurs) expect(html.toLowerCase()).toMatch(new RegExp(`<h1[^>]*>(mes |ma |mon )?${e.nom.toLowerCase()}<`));
          expect(requetes.filter((q) => /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/i.test(q)), requetes.join(" ¦ ").slice(0, 600)).toEqual([]);
          const texte = html.replace(/<[^>]*>/g, " ");
          expect(texte).not.toMatch(/€|\beuros?\b/i);
          expect(texte).not.toMatch(/supprim/i);
          expect(motsInterditsDans(texte)).toEqual([]);
        });
      }
    });
  }
});
