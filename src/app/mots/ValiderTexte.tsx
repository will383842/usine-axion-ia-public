"use client";

import { useState } from "react";

interface Props {
  texte: string;
  /** Action serveur jouée par « Je valide ce texte ». */
  action: () => Promise<void>;
}

/** Premier message et message avec le lien : « Valider » ouvre la relecture du texte entier, puis « Je valide ce texte ». */
export function ValiderApresRelecture({ texte, action }: Props) {
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return (
      <button type="button" className="bouton" onClick={() => setOuvert(true)}>
        Valider
      </button>
    );
  }
  return (
    <div role="dialog" aria-label="Relire avant de valider" className="flex w-full flex-col gap-3 rounded-xl border border-trait bg-fond p-4">
      <p className="font-bold">Relisez le texte en entier : c&apos;est lui que les personnes recevront.</p>
      <p className="whitespace-pre-line break-words">{texte}</p>
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <button type="submit" className="bouton">
            Je valide ce texte
          </button>
        </form>
        <button type="button" className="bouton-second" onClick={() => setOuvert(false)}>
          Fermer
        </button>
      </div>
    </div>
  );
}
