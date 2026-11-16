"use client";

import { useState } from "react";
import { Annulable } from "@/components/Annulable";
import { enregistrerPlafondAutomatique } from "./actions";

/** Saisie en euros ; l'envoi part au bout de 10 s, sauf « Annuler ». */
export function FormulairePlafond({ initial, aide }: { initial: string; aide: string }) {
  const [saisie, setSaisie] = useState(initial);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const envoyer = async () => {
    const r = await enregistrerPlafondAutomatique(saisie);
    setMessage({ texte: r.message, erreur: !r.ok });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-trait bg-surface p-4">
      <label className="flex flex-col gap-2 font-semibold">
        Plafond du mois, en euros
        <input
          className="champ"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setMessage(null);
          }}
        />
      </label>
      <p className="text-texte-doux">{aide}</p>
      {message && (
        <p role={message.erreur ? "alert" : "status"} className={message.erreur ? "rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce" : "font-semibold"}>
          {message.texte}
        </p>
      )}
      <Annulable libelle="Envoyer au Studio" message="Plafond envoyé au Studio dans 10 s." action={envoyer} className="bouton" />
    </section>
  );
}
