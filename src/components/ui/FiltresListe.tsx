"use client";

import { FAMILLES, LIBELLE_FAMILLE, LIBELLE_RESEAU, RESEAUX_FILTRE, type Famille, type Filtres, type ReseauFiltre } from "@/lib/filtres-liste";

const PUCE = "inline-flex min-h-11 items-center rounded-full border border-trait bg-surface px-4 font-semibold aria-pressed:border-terracotta aria-pressed:bg-terracotta-doux aria-pressed:text-terracotta-fonce";

/** Bandeau de filtres des listes : un réseau, une famille ; un second clic sur la puce choisie la retire. */
export function FiltresListe({ filtres, surChangement }: { filtres: Filtres; surChangement: (f: Filtres) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Réseau" className="flex flex-wrap gap-2">
        {RESEAUX_FILTRE.map((r: ReseauFiltre) => (
          <button key={r} type="button" className={PUCE} aria-pressed={filtres.reseau === r} onClick={() => surChangement({ ...filtres, reseau: filtres.reseau === r ? null : r })}>
            {LIBELLE_RESEAU[r]}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Famille" className="flex flex-wrap gap-2">
        {FAMILLES.map((f: Famille) => (
          <button key={f} type="button" className={PUCE} aria-pressed={filtres.famille === f} onClick={() => surChangement({ ...filtres, famille: filtres.famille === f ? null : f })}>
            {LIBELLE_FAMILLE[f]}
          </button>
        ))}
      </div>
    </div>
  );
}
