"use client";

import { useActionState } from "react";
import { placerLesNouveauxContenus, type EtatDate } from "./actions";

/** Place les nouvelles vidéos commandées selon vos rythmes, seulement quand vous le demandez. */
export function PlacerNouveaux() {
  const [etat, action, enCours] = useActionState<EtatDate, FormData>(placerLesNouveauxContenus, { message: null });
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={enCours} className="bouton self-start">
        Placer mes nouvelles vidéos
      </button>
      {etat.message ? <p role="status" className="text-texte-doux">{etat.message}</p> : null}
    </form>
  );
}
