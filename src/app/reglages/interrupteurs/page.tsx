import type { Metadata } from "next";
import { depots } from "@/donnees";
import { exigerSession } from "@/services/auth";
import { phraseDeInterrupteur } from "@/components/gabarit/ecrans";
import { BoutonInterrupteur } from "./BoutonInterrupteur";
import { BoutonTous } from "./BoutonTous";

export const metadata: Metadata = { title: "Interrupteurs" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await exigerSession();
  const interrupteurs = await depots.interrupteur.lister({ ordre: "nom" });
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Interrupteurs</h1>
      <p className="text-texte-doux">Tout est éteint au départ. Allumez une fonction quand vous êtes prêt : elle apparaît alors dans l&apos;Usine.</p>
      <div>
        <BoutonTous />
      </div>
      {interrupteurs.length === 0 ? (
        <p className="text-texte-doux">Aucun interrupteur pour le moment.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {interrupteurs.map((i) => (
            <li key={i.code} className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">{i.nom}</h2>
                {phraseDeInterrupteur(i.code, i.description) ? <p className="text-texte-doux">{phraseDeInterrupteur(i.code, i.description)}</p> : null}
                <p className="font-semibold">{i.allume ? "Allumé" : "Éteint"}</p>
              </div>
              <div>
                <BoutonInterrupteur code={i.code} allume={i.allume} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
