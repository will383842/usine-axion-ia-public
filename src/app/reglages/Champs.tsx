import Link from "next/link";
import type { ReactNode } from "react";

/** Message après un enregistrement, ou l'erreur à corriger. */
export function Retour({ etat, erreur }: { etat?: string; erreur?: string }) {
  if (erreur) return <p role="alert" className="rounded-xl border border-terracotta bg-surface p-3 font-semibold">{erreur}</p>;
  if (etat === "enregistre") return <p role="status" className="rounded-xl bg-mocha p-3 text-sur-mocha">Enregistré.</p>;
  return null;
}

export function Nombre({ nom, libelle, defaut, min = 0, max, pas = 1, aide }: { nom: string; libelle: string; defaut: number; min?: number; max?: number; pas?: number; aide?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{libelle}</span>
      <input name={nom} type="number" inputMode="decimal" className="champ" defaultValue={defaut} min={min} max={max} step={pas} required />
      {aide ? <span className="text-texte-doux">{aide}</span> : null}
    </label>
  );
}

export function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
      <legend className="px-1 text-lg font-bold">{titre}</legend>
      {children}
    </fieldset>
  );
}

export function Entete({ titre, intro }: { titre: string; intro: string }) {
  return (
    <header className="flex flex-col gap-2">
      <Link href="/reglages" className="inline-flex min-h-11 items-center font-semibold underline">
        ← Réglages
      </Link>
      <h1 className="text-3xl font-bold">{titre}</h1>
      <p className="text-texte-doux">{intro}</p>
    </header>
  );
}
