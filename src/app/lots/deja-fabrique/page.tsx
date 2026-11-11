import type { Metadata } from "next";
import Link from "next/link";
import { CODES_SERVICE, CODES_TAILLE, TYPES_CONTENU } from "@/contrats";
import { requete } from "@/lib/base";
import { listerDejaFabrique, lotsAllume } from "@/lots";
import { LIBELLE_SERVICE } from "@/reglages/modele";
import { exigerSession } from "@/services/auth";
import { Retour } from "../../reglages/Champs";
import { noterDejaFabrique } from "../actions";
import { Eteint } from "../Eteint";

export const metadata: Metadata = { title: "Déjà fabriqué" };
export const dynamic = "force-dynamic";

const LIBELLE_TYPE: Record<(typeof TYPES_CONTENU)[number], string> = {
  video: "Vidéo",
  carrousel: "Carrousel",
  image: "Texte avec image",
  texte: "Texte seul",
  story: "Story",
};

type Option = { code: string; nom: string | null };

function Choix({ nom, libelle, options, vide, defaut }: { nom: string; libelle: string; options: Option[]; vide?: string; defaut?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{libelle}</span>
      <select name={nom} className="champ" defaultValue={defaut ?? ""}>
        {vide !== undefined ? <option value="">{vide}</option> : null}
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.nom ?? o.code}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function Page({ searchParams }: PageProps<"/lots/deja-fabrique">) {
  await exigerSession();
  if (!(await lotsAllume())) return <Eteint />;
  const sp = await searchParams;
  const lire = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const metier = lire("metier");
  const [metiers, deja] = await Promise.all([
    requete<Option>("SELECT code, nom FROM metier WHERE etat <> 'retire' ORDER BY nom, code"),
    listerDejaFabrique(),
  ]);
  const choisi = metiers.find((m) => m.code === metier);
  const [cas, sujets, formats, familles] = choisi
    ? await Promise.all([
        requete<Option>("SELECT code, coalesce(titre, code) || ' (' || service || ')' AS nom FROM cas_usage WHERE cible = $1 AND etat <> 'retire' ORDER BY code", [choisi.code]),
        requete<Option>("SELECT code, titre AS nom FROM sujet WHERE etat <> 'retire' ORDER BY code"),
        requete<Option>(
          "SELECT code, coalesce(nom, code) AS nom FROM format_video WHERE etat <> 'retire' UNION ALL SELECT code, code AS nom FROM format_autre WHERE etat <> 'retire' ORDER BY nom",
        ),
        requete<Option>("SELECT DISTINCT famille AS code, famille AS nom FROM accroche WHERE etat <> 'retire' AND coalesce(famille, '') <> '' ORDER BY famille"),
      ])
    : [[], [], [], []];
  const nomMetier = new Map(metiers.map((m) => [m.code, m.nom ?? m.code]));

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/lots" className="inline-flex min-h-11 items-center font-semibold underline">
          ← Mes vidéos
        </Link>
        <h1 className="text-3xl font-bold">Déjà fabriqué</h1>
        <p className="text-texte-doux">Notez les vidéos faites avant l&apos;Usine : elles ne seront pas refaites. Ce que vous ne savez pas (taille, accroche) vaut pour toutes.</p>
      </header>
      <Retour etat={lire("etat")} erreur={lire("erreur")} />

      {!choisi ? (
        <form method="get" className="flex flex-col gap-4">
          <Choix nom="metier" libelle="Métier" options={metiers} />
          <button type="submit" className="bouton self-start">
            Continuer
          </button>
        </form>
      ) : (
        <form action={noterDejaFabrique} className="flex flex-col gap-4">
          <input type="hidden" name="metier" value={choisi.code} />
          <p className="text-lg font-bold">
            {choisi.nom ?? choisi.code}{" "}
            <Link href="/lots/deja-fabrique" className="inline-flex min-h-11 items-center font-normal underline">
              changer
            </Link>
          </p>
          <Choix nom="cas_usage" libelle="Cas" options={cas} vide="— (je choisis un sujet)" />
          <Choix nom="sujet" libelle="Ou sujet" options={sujets} vide="—" />
          <Choix nom="service" libelle="Service (si pas de cas)" options={CODES_SERVICE.map((c) => ({ code: c, nom: LIBELLE_SERVICE[c] }))} vide="Tous" />
          <Choix nom="format" libelle="Format" options={formats} defaut={formats.find((f) => f.code === "tableau-anime")?.code} />
          <Choix nom="type_contenu" libelle="Type de contenu" options={TYPES_CONTENU.map((t) => ({ code: t, nom: LIBELLE_TYPE[t] }))} defaut="video" />
          <Choix nom="taille" libelle="Taille d'entreprise" options={CODES_TAILLE.map((c) => ({ code: c, nom: c }))} vide="Je ne sais pas" />
          <Choix nom="structure" libelle="Famille d'accroche" options={familles} vide="Je ne sais pas" />
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Fabriquée le</span>
            <input type="date" name="fabrique_le" className="champ" defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Code de la vidéo (facultatif)</span>
            <input name="code_version" className="champ" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Note (facultatif)</span>
            <input name="note" className="champ" autoComplete="off" maxLength={300} />
          </label>
          <button type="submit" className="bouton self-start">
            Noter
          </button>
        </form>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Déjà noté</h2>
        {deja.length === 0 ? <p className="text-texte-doux">Rien pour l&apos;instant.</p> : null}
        <ul className="flex flex-col gap-2">
          {deja.map((d) => (
            <li key={d.id} className="rounded-xl border border-trait bg-surface p-3">
              {d.metier ? (nomMetier.get(d.metier) ?? d.metier) : "—"} · {d.cas_usage ?? d.sujet ?? d.actualite ?? "—"} · {d.format ?? "—"} ·{" "}
              {new Date(d.fabrique_le).toLocaleDateString("fr-FR")}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
