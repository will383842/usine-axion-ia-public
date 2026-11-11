"use client";

import { useActionState } from "react";
import { deplacerContenu, type EtatDate } from "./actions";

/** Le jour proposé d'un contenu, modifiable. */
export function ChangerJour({ id, jour }: { id: string; jour: string }) {
  const [etat, action, enCours] = useActionState<EtatDate, FormData>(deplacerContenu, { message: null });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`jour-${id}`}>
        Jour de publication
      </label>
      <input id={`jour-${id}`} name="jour" type="date" required defaultValue={jour} className="min-h-11 rounded-lg border border-trait bg-white px-3 text-base" />
      <button type="submit" disabled={enCours} className="bouton-second">
        Changer le jour
      </button>
      {etat.message ? <p role="status" className="w-full text-texte-doux">{etat.message}</p> : null}
    </form>
  );
}
