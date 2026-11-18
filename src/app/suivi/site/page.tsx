import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/gabarit/EnTete";
import { ETATS_LIGNE, libelleDate, lireVideosSurLeSite, suiviAllume } from "@/suivi";
import { exigerSession } from "@/services/auth";
import { surLeSite } from "./actions";

export const metadata: Metadata = { title: "Vidéos sur le site" };
export const dynamic = "force-dynamic";

function Eteint({ titre }: { titre: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-trait bg-surface p-5">
      <h1 className="text-3xl font-bold">{titre}</h1>
      <p>Cet écran est éteint. Pour le voir, allumez « Écrans de suivi » dans les réglages.</p>
      <Link href="/reglages/interrupteurs" className="bouton self-start">
        Ouvrir les interrupteurs
      </Link>
    </section>
  );
}

export default async function Page() {
  await exigerSession();
  if (!(await suiviAllume())) return <Eteint titre="Vidéos sur le site" />;
  const videos = await lireVideosSurLeSite();
  return (
    <div className="flex flex-col gap-6">
      <EnTete titre="Vidéos sur le site" phrase="Cochez les vidéos qui sont sur le site. Décocher ne supprime rien : la date du retrait est notée." />
      {videos.length === 0 ? <p className="rounded-2xl border border-trait bg-surface p-4">Aucune vidéo pour l&apos;instant.</p> : null}
      <ul className="flex flex-col gap-2">
        {videos.map((v) => (
          <li key={v.id} className="flex flex-col gap-2 rounded-2xl border border-trait bg-surface p-4">
            <span className="font-semibold">
              Vidéo {v.id}
              {v.format ? ` · ${v.format}` : ""}
            </span>
            <span className="text-texte-doux">
              {ETATS_LIGNE.find((e) => e.code === v.etat)?.libelle ?? v.etat}
              {!v.surLeSite && v.retireLe ? ` · retirée du site le ${libelleDate(v.retireLe)}` : ""}
            </span>
            <form action={surLeSite.bind(null, v.id, !v.surLeSite)}>
              <button type="submit" role="checkbox" aria-checked={v.surLeSite} className="inline-flex min-h-11 min-w-11 items-center gap-3 text-left font-semibold">
                <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-lg border-2 border-trait bg-surface">
                  {v.surLeSite ? "✓" : ""}
                </span>
                Sur le site
              </button>
            </form>
          </li>
        ))}
      </ul>
      <Link href="/suivi" className="inline-flex min-h-11 items-center font-semibold underline">
        Retour au suivi
      </Link>
    </div>
  );
}
