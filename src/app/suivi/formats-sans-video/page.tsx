import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/gabarit/EnTete";
import { ETATS_LIGNE, lireFormatsSansVideo, suiviAllume } from "@/suivi";
import { exigerSession } from "@/services/auth";

export const metadata: Metadata = { title: "Formats sans vidéo" };
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
  if (!(await suiviAllume())) return <Eteint titre="Formats sans vidéo" />;
  const par = await lireFormatsSansVideo();
  const total = par.reduce((s, x) => s + x.nombre, 0);
  return (
    <div className="flex flex-col gap-6">
      <EnTete titre="Formats sans vidéo" phrase="Les carrousels, images, textes et stories de vos lots, selon où ils en sont." />
      {total === 0 ? <p className="rounded-2xl border border-trait bg-surface p-4">Aucun contenu sans vidéo pour l&apos;instant.</p> : null}
      <ul className="flex flex-col gap-2">
        {ETATS_LIGNE.map((e) => (
          <li key={e.code} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-trait bg-surface px-4 py-3">
            <span className="font-semibold">{e.libelle}</span>
            <span className="text-xl font-bold">{par.find((x) => x.etat === e.code)?.nombre ?? 0}</span>
          </li>
        ))}
      </ul>
      <Link href="/suivi" className="inline-flex min-h-11 items-center font-semibold underline">
        Retour au suivi
      </Link>
    </div>
  );
}
