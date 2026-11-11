"use client";

import { useActionState } from "react";
import { connexion, type EtatConnexion } from "./actions";
import { ChampMotDePasse } from "@/components/ChampMotDePasse";

export function FormulaireConnexion({ suite }: { suite: string }) {
  const [etat, agir, enCours] = useActionState<EtatConnexion, FormData>(connexion, { message: null });
  return (
    <form action={agir} className="flex flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />
      <label className="flex flex-col gap-2 font-semibold">
        Mot de passe
        <ChampMotDePasse className="champ" name="motDePasse" autoComplete="current-password" required autoFocus />
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
        {enCours ? "Un instant…" : "Entrer"}
      </button>
    </form>
  );
}
