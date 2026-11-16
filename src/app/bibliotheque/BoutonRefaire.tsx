"use client";

import { createContext, useContext, useState, type MouseEvent, type ReactNode } from "react";
import { Annulable } from "@/components/Annulable";
import { refaireAction } from "./actions";

/** Un seul geste à la fois sur la page : l'identifiant de la carte dont « Annuler » est offert, ou null. */
const Geste = createContext<{ enCours: string | null; setEnCours: (id: string | null) => void }>({ enCours: null, setEnCours: () => {} });

export function GroupeRefaire({ children }: { children: ReactNode }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  return <Geste.Provider value={{ enCours, setEnCours }}>{children}</Geste.Provider>;
}

/** « Refaire » avec « Annuler » 10 s ; tant qu'un « Annuler » est offert, les « Refaire » des autres cartes sont cachés (sans démonter celui qui attend). */
export function BoutonRefaire({ id }: { id: string }) {
  const { enCours, setEnCours } = useContext(Geste);
  const [message, setMessage] = useState<string | null>(null);
  const suivre = (e: MouseEvent<HTMLElement>) => {
    const bouton = (e.target as HTMLElement).closest("button");
    if (!bouton) return;
    setEnCours((bouton.textContent ?? "").trim().startsWith("Annuler") ? null : id);
  };
  return (
    <div className="flex flex-col gap-2">
      <div hidden={enCours !== null && enCours !== id} onClickCapture={suivre}>
        <Annulable
          libelle="Refaire"
          message="Remis à refaire."
          action={async () => {
            setMessage((await refaireAction(id)).message);
            setEnCours(null);
          }}
        />
      </div>
      {message ? (
        <p role="status" className="text-texte-doux">
          {message}
        </p>
      ) : null}
    </div>
  );
}
