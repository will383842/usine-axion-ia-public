"use client";

import { useRouter } from "next/navigation";
import { Annulable } from "@/components/Annulable";
import { allumerEcran } from "./actions";
import { ecranParCode } from "./ecrans";

/** Ce que Will voit en ouvrant un écran éteint : une seule carte, avec le bouton pour l'allumer. `dansOnglet` : sous le titre d'une page à onglets. */
export function EcranEteint({ code, dansOnglet = false }: { code: string; dansOnglet?: boolean }) {
  const router = useRouter();
  const ecran = ecranParCode(code);
  if (!ecran) return null;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-trait bg-surface p-5">
      {dansOnglet ? <h2 className="text-2xl font-bold">{ecran.nom}</h2> : <h1 className="text-3xl font-bold">{ecran.nom}</h1>}
      <p>{ecran.phrase}</p>
      <div>
        <Annulable
          libelle="Allumer cet écran"
          message="Écran allumé."
          className="bouton"
          action={async () => {
            await allumerEcran(code);
            router.refresh();
          }}
        />
      </div>
    </section>
  );
}
