import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/gabarit/EnTete";
import { libelleDate, lireFiabilite, suiviAllume } from "@/suivi";
import { exigerSession } from "@/services/auth";

export const metadata: Metadata = { title: "Fiabilité" };
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
  if (!(await suiviAllume())) return <Eteint titre="Fiabilité" />;
  const f = await lireFiabilite();
  return (
    <div className="flex flex-col gap-6">
      <EnTete titre="Fiabilité" phrase="Les signaux de silence, et la date du dernier relevé de chaque source." />
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Alertes</h2>
        {!f.veilleAllumee ? (
          <p className="rounded-2xl border border-trait bg-surface p-4">La surveillance est éteinte : allumez « Alerte de silence » dans les réglages pour voir les alertes.</p>
        ) : f.alertes.length === 0 ? (
          <p className="rounded-2xl border border-trait bg-surface p-4">Aucune alerte pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {f.alertes.map((a) => (
              <li key={a.cle} className="flex flex-col gap-2 rounded-2xl border border-trait bg-surface p-4">
                <span className="font-bold">{a.titre}</span>
                <span className="text-texte-doux">{a.detail}</span>
                <Link href={a.lien} className="bouton self-start">
                  {a.bouton}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Dernier relevé de chaque source</h2>
        <ul className="flex flex-col gap-2">
          {f.sources.map((s) => (
            <li key={s.code} className="flex flex-col gap-1 rounded-2xl border border-trait bg-surface p-4">
              <span className="font-semibold">{s.libelle}</span>
              <span className="text-texte-doux">{libelleDate(s.dernier)}</span>
            </li>
          ))}
        </ul>
      </section>
      <Link href="/suivi" className="inline-flex min-h-11 items-center font-semibold underline">
        Retour au suivi
      </Link>
    </div>
  );
}
