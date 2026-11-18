import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/gabarit/EnTete";
import { CANAUX_LIBELLES, lireOppositionsParCanal, suiviAllume } from "@/suivi";
import { exigerSession } from "@/services/auth";

export const metadata: Metadata = { title: "STOP et opposition" };
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
  if (!(await suiviAllume())) return <Eteint titre="STOP et opposition" />;
  const par = await lireOppositionsParCanal();
  return (
    <div className="flex flex-col gap-6">
      <EnTete titre="STOP et opposition" phrase="Combien de personnes ont dit STOP, par réseau. Aucune adresse n'est affichée." bouton={{ href: "/reglages/oppositions", libelle: "Ajouter un STOP" }} />
      <ul className="flex flex-col gap-2">
        {par.map((x) => (
          <li key={x.canal} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-trait bg-surface px-4 py-3">
            <span className="font-semibold">{CANAUX_LIBELLES[x.canal] ?? x.canal}</span>
            <span className="text-xl font-bold">{x.nombre}</span>
          </li>
        ))}
      </ul>
      <Link href="/suivi" className="inline-flex min-h-11 items-center font-semibold underline">
        Retour au suivi
      </Link>
    </div>
  );
}
