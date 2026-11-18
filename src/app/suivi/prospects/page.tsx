import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/gabarit/EnTete";
import { libelleReseau, libelleTotal, lireProspects, suiviAllume } from "@/suivi";
import { exigerSession } from "@/services/auth";

export const metadata: Metadata = { title: "Prospects" };
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
  if (!(await suiviAllume())) return <Eteint titre="Prospects" />;
  const p = await lireProspects();
  return (
    <div className="flex flex-col gap-6">
      <EnTete titre="Prospects" phrase="Des nombres par réseau sur les sept derniers jours reçus. Aucun nom, aucune adresse, aucun numéro." />
      {p.totaux.length === 0 ? <p className="rounded-2xl border border-trait bg-surface p-4">Pas encore de donnée reçue.</p> : null}
      <ul className="flex flex-col gap-3">
        {p.totaux.map((t) => (
          <li key={t.reseau} className="flex flex-col gap-2 rounded-2xl border border-trait bg-surface p-4">
            <span className="text-xl font-bold">{libelleReseau(t.reseau)}</span>
            <span>Demandes : {libelleTotal(t.demandes)}</span>
            <span>Guides envoyés : {libelleTotal(t.guides_envoyes)}</span>
            <span>E-mails confirmés : {libelleTotal(t.accords)}</span>
          </li>
        ))}
      </ul>
      <p className="text-texte-doux">« moins de 3 » : le chiffre est caché quand il est trop petit pour rester anonyme.</p>
      <Link href="/suivi" className="inline-flex min-h-11 items-center font-semibold underline">
        Retour au suivi
      </Link>
    </div>
  );
}
