"use server";

import { changerMotDePasse, exigerSession } from "@/services/auth";

export type EtatChangement = { message: string | null; fait: boolean };

export async function changement(_avant: EtatChangement, formulaire: FormData): Promise<EtatChangement> {
  await exigerSession();
  const r = await changerMotDePasse(
    String(formulaire.get("ancien") ?? ""),
    String(formulaire.get("nouveau") ?? ""),
    String(formulaire.get("confirmation") ?? ""),
  );
  return r.ok ? { message: "Mot de passe changé. Vos autres appareils sont déconnectés.", fait: true } : { message: r.message, fait: false };
}
