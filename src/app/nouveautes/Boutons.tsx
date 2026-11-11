"use client";

import { useActionState } from "react";
import { Annulable } from "@/components/Annulable";
import { ecarter, garder, type EtatGarder } from "./actions";

export function BoutonGarder({ code }: { code: string }) {
  const [etat, action, enCours] = useActionState<EtatGarder, FormData>(garder, { message: null });
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <button type="submit" disabled={enCours} className="bouton">
        Garder
      </button>
      {etat.message ? <p role="alert" className="font-semibold">{etat.message}</p> : null}
    </form>
  );
}

export function BoutonEcarter({ code, libelle = "Écarter" }: { code: string; libelle?: string }) {
  return <Annulable libelle={libelle} message="Nouveauté écartée." action={() => ecarter(code)} />;
}
