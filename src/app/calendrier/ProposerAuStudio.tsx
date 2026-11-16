"use client";

import { useState, useTransition } from "react";
import { Annulable } from "@/components/Annulable";
import { proposerAuStudioAction, relireDepuisStudioAction } from "./actions";

/** Bouton « Proposer au Studio » d'une ligne du calendrier : 10 s pour annuler, puis la phrase rendue par le Studio. */
export function ProposerAuStudio({ id }: { id: string }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Annulable
        libelle="Proposer au Studio"
        message="Proposée au Studio."
        action={async () => {
          const r = await proposerAuStudioAction(id);
          setMessage(r.message);
        }}
      />
      {message ? <p role="status" className="text-texte-doux">{message}</p> : null}
    </div>
  );
}

/** « Mettre à jour depuis le Studio » : relit l'état des lignes déjà proposées. */
export function MettreAJourDepuisStudio() {
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={enCours}
        className="bouton-second self-start"
        onClick={() => demarrer(async () => setMessage((await relireDepuisStudioAction()).message))}
      >
        Mettre à jour depuis le Studio
      </button>
      {message ? <p role="status" className="text-texte-doux">{message}</p> : null}
    </div>
  );
}
