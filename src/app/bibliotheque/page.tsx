import type { Metadata } from "next";
import Link from "next/link";
import { LIBELLE_TYPE, bibliothequeAllumee, filtresDepuis, listerBibliotheque, listerRefuses, type LigneBibliotheque } from "@/bibliotheque";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { EnTete, EtatVide } from "@/components/gabarit/EnTete";
import { RESEAUX, TYPES_CONTENU } from "@/contrats";
import { requete } from "@/lib/base";
import { INTERRUPTEUR_LOTS } from "@/lots/regles";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { exigerSession } from "@/services/auth";
import { BoutonRefaire, GroupeRefaire } from "./BoutonRefaire";

export const metadata: Metadata = { title: "Bibliothèque" };
export const dynamic = "force-dynamic";

const nomReseau = (r: string) => (LIBELLE_RESEAU as Record<string, string>)[r] ?? r;

function Carte({ l }: { l: LigneBibliotheque }) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-trait bg-surface p-4">
      <p className="font-semibold">{l.metier_nom ?? "Métier non précisé"}</p>
      <p className="text-texte-doux">
        {LIBELLE_TYPE[l.type_contenu] ?? l.type_contenu}
        {l.format ? ` · ${l.format}` : ""} · {l.reseaux.map(nomReseau).join(", ") || "aucun réseau"}
      </p>
      {l.motif ? <p className="font-semibold">Motif : {l.motif}</p> : null}
      <BoutonRefaire id={l.id} />
    </li>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigerSession();
  if (!(await bibliothequeAllumee())) return <EcranEteint code={INTERRUPTEUR_LOTS} />;
  const q = await searchParams;
  const f = filtresDepuis(q);
  const [fabriquees, refusees, metiers] = await Promise.all([
    listerBibliotheque(f),
    listerRefuses(),
    requete<{ code: string; nom: string }>(`SELECT code, nom FROM metier WHERE etat <> 'retire' ORDER BY nom`),
  ]);

  return (
    <section className="flex flex-col gap-8">
      <EnTete titre="Bibliothèque" phrase="Ce qui a été fabriqué ou publié, et ce que vous avez refusé. « Refaire » prépare une nouvelle vidéo avec les mêmes choix." />
      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 font-semibold">
          Métier
          <select name="metier" defaultValue={f.metier ?? ""} className="min-h-11 rounded-xl border border-trait bg-surface px-3 text-base">
            <option value="">Tous</option>
            {metiers.map((m) => (
              <option key={m.code} value={m.code}>{m.nom}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Réseau
          <select name="reseau" defaultValue={f.reseau ?? ""} className="min-h-11 rounded-xl border border-trait bg-surface px-3 text-base">
            <option value="">Tous</option>
            {RESEAUX.map((r) => (
              <option key={r} value={r}>{nomReseau(r)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Type
          <select name="type" defaultValue={f.type ?? ""} className="min-h-11 rounded-xl border border-trait bg-surface px-3 text-base">
            <option value="">Tous</option>
            {TYPES_CONTENU.map((t) => (
              <option key={t} value={t}>{LIBELLE_TYPE[t]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="bouton min-h-11">Filtrer</button>
      </form>

      <GroupeRefaire>
      <section className="flex flex-col gap-4" aria-labelledby="fabriquees">
        <h2 id="fabriquees" className="text-2xl font-bold">Fabriquées et publiées</h2>
        {fabriquees.length === 0 ? (
          <EtatVide message="Rien à montrer pour l'instant." bouton={{ href: "/lots", libelle: "Voir mes vidéos" }} />
        ) : (
          <ul className="flex flex-col gap-3">{fabriquees.map((l) => <Carte key={l.id} l={l} />)}</ul>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="refuses">
        <h2 id="refuses" className="text-2xl font-bold">Refusés</h2>
        {refusees.length === 0 ? <EtatVide message="Aucune vidéo refusée." /> : <ul className="flex flex-col gap-3">{refusees.map((l) => <Carte key={l.id} l={l} />)}</ul>}
      </section>
      </GroupeRefaire>
      <Link href="/lots" className="bouton-second self-start">Retour à mes vidéos</Link>
    </section>
  );
}
