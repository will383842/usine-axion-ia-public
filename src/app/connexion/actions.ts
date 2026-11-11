"use server";

import { redirect } from "next/navigation";
import { suiteSure } from "@/lib/suite-sure";
import {
  commencerSecondCode,
  entrerCodeSecours,
  entrerSecondCode,
  enregistrerSecondCode,
  premiereOuverture,
  seConnecter,
  seDeconnecter,
} from "@/services/auth";

export type EtatConnexion = { message: string | null };

/** Après le mot de passe : /connexion demande le second code (la suite est gardée pour après). */
function versSecondCode(suite: unknown): string {
  const s = suiteSure(suite);
  return s === "/" ? "/connexion" : `/connexion?suite=${encodeURIComponent(s)}`;
}

export async function connexion(_avant: EtatConnexion, formulaire: FormData): Promise<EtatConnexion> {
  const r = await seConnecter(String(formulaire.get("motDePasse") ?? ""), formulaire.get("resterConnecte") === "on");
  if (!r.ok) return { message: r.message };
  redirect(versSecondCode(formulaire.get("suite")));
}

/** Première ouverture : sans session par nature (aucun mot de passe n'existe encore) ; la limite d'essais s'applique. */
export async function ouverture(_avant: EtatConnexion, formulaire: FormData): Promise<EtatConnexion> {
  const r = await premiereOuverture(
    String(formulaire.get("motDePasse") ?? ""),
    String(formulaire.get("confirmation") ?? ""),
    formulaire.get("resterConnecte") === "on",
  );
  if (!r.ok) return { message: r.message };
  redirect("/connexion");
}

export async function deconnexion(): Promise<void> {
  await seDeconnecter();
  redirect("/connexion");
}

// N-26 · Second code. Ces actions n'exigent que la session partielle (mot de passe accepté) : services/auth.ts.

export type EtatSecret = { message: string | null; secret?: string; lien?: string };

/** Montre le secret d'un nouveau téléphone. Il n'existe que dans cette réponse : jamais relu, jamais réaffiché. */
export async function montrerSecret(): Promise<EtatSecret> {
  const r = await commencerSecondCode();
  return r.ok ? { message: null, secret: r.secret, lien: r.lien } : { message: r.message };
}

export type EtatPremierCode = { message: string | null; codesSecours?: string[] };

/** Premier code du nouveau téléphone : rend les codes de secours, une seule fois. */
export async function premierCode(_avant: EtatPremierCode, formulaire: FormData): Promise<EtatPremierCode> {
  const r = await enregistrerSecondCode(String(formulaire.get("code") ?? ""));
  return r.ok ? { message: null, codesSecours: r.codesSecours } : { message: r.message };
}

export async function secondCode(_avant: EtatConnexion, formulaire: FormData): Promise<EtatConnexion> {
  const r = await entrerSecondCode(String(formulaire.get("code") ?? ""));
  if (!r.ok) return { message: r.message };
  redirect(suiteSure(formulaire.get("suite")));
}

/** Téléphone perdu : le code de secours mène à l'enregistrement d'un nouveau téléphone. */
export async function codeSecours(_avant: EtatConnexion, formulaire: FormData): Promise<EtatConnexion> {
  const r = await entrerCodeSecours(String(formulaire.get("code") ?? ""));
  if (!r.ok) return { message: r.message };
  redirect(versSecondCode(formulaire.get("suite")));
}
