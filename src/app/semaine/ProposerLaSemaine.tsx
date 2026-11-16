"use client";

import { useState } from "react";
import { Annulable } from "@/components/Annulable";
import { proposerLaSemaineAction } from "./actions";

/** « Proposer la semaine au Studio » : 10 s pour annuler, puis la phrase rendue. */
export function ProposerLaSemaine() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Annulable
        libelle="Proposer la semaine au Studio"
        message="Semaine proposée au Studio."
        className="bouton"
        action={async () => setMessage((await proposerLaSemaineAction()).message)}
      />
      {message ? <p role="status" className="text-texte-doux">{message}</p> : null}
    </div>
  );
}
