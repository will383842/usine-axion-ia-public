"use client";

import { useActionState } from "react";
import { ouverture, type EtatConnexion } from "./actions";
import { ChampMotDePasse } from "@/components/ChampMotDePasse";

export function FormulairePremiereOuverture() {
  const [etat, agir, enCours] = useActionState<EtatConnexion, FormData>(ouverture, { message: null });
  return (
    <form action={agir} className="flex flex-col gap-4">
      <p className="text-texte-doux">12 caractères au moins. Une phrase de quelques mots est plus facile à retenir et plus sûre.</p>
      <label className="flex flex-col gap-2 font-semibold">
        Mot de passe
        <ChampMotDePasse className="champ" name="motDePasse" autoComplete="new-password" minLength={12} required autoFocus />
      </label>
      <label className="flex flex-col gap-2 font-semibold">
        Le même, encore une fois
        <ChampMotDePasse className="champ" name="confirmation" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="resterConnecte" defaultChecked className="size-5 accent-[var(--terracotta)]" />
        Rester connecté sur cet appareil
      </label>
      {etat.message && (
        <p role="alert" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
          {etat.message}
        </p>
      )}
      <button type="submit" className="bouton" disabled={enCours}>
        {enCours ? "Un instant…" : "Enregistrer"}
      </button>
    </form>
  );
}
