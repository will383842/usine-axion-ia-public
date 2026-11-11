"use client";

import { useActionState } from "react";
import { changement, type EtatChangement } from "./actions";
import { ChampMotDePasse } from "@/components/ChampMotDePasse";

export function FormulaireChangement() {
  const [etat, agir, enCours] = useActionState<EtatChangement, FormData>(changement, { message: null, fait: false });
  return (
    <form action={agir} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 font-semibold">
        Mot de passe actuel
        <ChampMotDePasse className="champ" name="ancien" autoComplete="current-password" required autoFocus />
      </label>
      <p className="text-texte-doux">Nouveau : 12 caractères au moins. Une phrase de quelques mots est plus facile à retenir.</p>
      <label className="flex flex-col gap-2 font-semibold">
        Nouveau mot de passe
        <ChampMotDePasse className="champ" name="nouveau" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="flex flex-col gap-2 font-semibold">
        Le même, encore une fois
        <ChampMotDePasse className="champ" name="confirmation" autoComplete="new-password" minLength={12} required />
      </label>
      {etat.message && (
        <p role={etat.fait ? "status" : "alert"} className={`rounded-lg px-3 py-2 font-semibold ${etat.fait ? "border border-trait bg-surface" : "bg-terracotta-doux text-terracotta-fonce"}`}>
          {etat.message}
        </p>
      )}
      <button type="submit" className="bouton" disabled={enCours}>
        {enCours ? "Un instant…" : "Changer mon mot de passe"}
      </button>
    </form>
  );
}
