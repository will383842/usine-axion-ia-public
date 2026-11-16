"use client";

import { useState } from "react";
import { Annulable } from "@/components/Annulable";
import { proposerLaSemaineAction } from "./actions";

/** « Proposer la semaine au Studio » : 10 s pour annuler, puis la phrase rendue. */
export function ProposerLaSemaine() {
  const [message, setMessage] = useState<string | null>(null);
  const [reportees, setReportees] = useState<{ ligne: string; raison: string }[]>([]);
  return (
    <div className="flex flex-col gap-2">
      <Annulable
        libelle="Proposer la semaine au Studio"
        message="Semaine proposée au Studio."
        className="bouton"
        action={async () => {
          const r = await proposerLaSemaineAction();
          setMessage(r.message);
          setReportees(r.reportees);
        }}
      />
      {message ? <p role="status" className="text-texte-doux">{message}</p> : null}
      {reportees.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Contenus restés sans jour">
          {reportees.map((r) => (
            <li key={r.ligne}>
              Contenu {r.ligne} : {r.raison}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
