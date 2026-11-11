"use client";

import { useState } from "react";
import { Icone } from "./Icone";

/** « Copier » un texte (pour le recopier ailleurs) : l'état « Copié » se voit 2 s. Aucun envoi. */
export function BoutonCopier({ texte, quoi }: { texte: string; quoi?: string }) {
  const [fait, setFait] = useState(false);
  return (
    <button
      type="button"
      aria-label={quoi ? `Copier ${quoi}` : undefined}
      data-fait={fait ? "oui" : undefined}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-trait bg-surface px-3 font-semibold data-[fait=oui]:border-vert data-[fait=oui]:bg-vert-doux data-[fait=oui]:text-vert"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setFait(true);
          setTimeout(() => setFait(false), 2000);
        } catch {
          setFait(false);
        }
      }}
    >
      <Icone nom={fait ? "coche" : "copier"} taille={18} />
      {fait ? "Copié" : "Copier"}
    </button>
  );
}
