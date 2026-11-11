"use client";

import { useState } from "react";

/** Copie un texte pour le recopier dans l'outil d'envoi. Aucun envoi. */
export function Copier({ texte }: { texte: string }) {
  const [fait, setFait] = useState(false);
  return (
    <button
      type="button"
      className="bouton-second"
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
      {fait ? "Copié ✓" : "Copier"}
    </button>
  );
}
