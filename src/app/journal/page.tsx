import type { Metadata } from "next";
import Link from "next/link";
import { EnTete, EtatVide } from "@/components/gabarit/EnTete";
import { journalAllume, lireJournal, sujetsDuJournal } from "@/journal";
import { exigerSession } from "@/services/auth";

export const metadata: Metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

const adresse = (p: { sujet?: string; cible?: string; page?: number }) => {
  const q = new URLSearchParams();
  if (p.sujet) q.set("sujet", p.sujet);
  if (p.cible) q.set("cible", p.cible);
  if (p.page && p.page > 1) q.set("page", String(p.page));
  const s = q.toString();
  return `/journal${s ? `?${s}` : ""}`;
};

const quand = (d: Date) => d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function Page({ searchParams }: { searchParams: Promise<{ sujet?: string; cible?: string; page?: string }> }) {
  await exigerSession();
  if (!(await journalAllume())) {
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-trait bg-surface p-5">
        <h1 className="text-3xl font-bold">Journal</h1>
        <p>Cet écran est éteint pour le moment.</p>
      </section>
    );
  }
  const q = await searchParams;
  const sujet = q.sujet?.trim() || undefined;
  const cible = q.cible?.trim() || undefined;
  const { lignes, page, suivante } = await lireJournal({ sujet, cible, page: Number(q.page) || 1 });
  const sujets = await sujetsDuJournal();

  return (
    <section className="flex flex-col gap-6">
      <EnTete titre="Journal" phrase="Tout ce qui a changé, du plus récent au plus ancien. Lecture seule." />

      <form method="get" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Sujet
          <select name="sujet" defaultValue={sujet ?? ""} className="min-h-11 rounded-xl border border-trait bg-surface px-3">
            <option value="">Tous les sujets</option>
            {sujets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Cible (par exemple L12 pour un lot et ses vidéos)
          <input name="cible" defaultValue={cible ?? ""} className="min-h-11 rounded-xl border border-trait bg-surface px-3" />
        </label>
        <button type="submit" className="bouton self-start">
          Filtrer
        </button>
      </form>

      {lignes.length === 0 ? (
        <EtatVide message="Rien dans le journal pour ce filtre." bouton={sujet || cible ? { href: "/journal", libelle: "Tout afficher" } : undefined} />
      ) : (
        <ul className="flex flex-col gap-3">
          {lignes.map((l) => (
            <li key={l.id} className="flex flex-col gap-1 rounded-2xl border border-trait bg-surface p-4">
              <p className="text-texte-doux">
                {quand(l.le)} · {l.sujet}
                {l.cible ? ` · ${l.cible}` : ""}
              </p>
              <p>{l.message}</p>
              {l.donnees ? <pre className="overflow-x-auto whitespace-pre-wrap break-words text-base">{JSON.stringify(l.donnees, null, 1)}</pre> : null}
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Pages" className="flex flex-wrap gap-3">
        {page > 1 ? (
          <Link href={adresse({ sujet, cible, page: page - 1 })} className="bouton">
            Plus récent
          </Link>
        ) : null}
        {suivante ? (
          <Link href={adresse({ sujet, cible, page: page + 1 })} className="bouton">
            Plus ancien
          </Link>
        ) : null}
      </nav>
    </section>
  );
}
