"use client";

import { Annulable } from "@/components/Annulable";
import { allumerCompte } from "./actions";

export function BoutonCompte({
  code,
  actif,
  nom,
}: {
  code: string;
  actif: boolean;
  nom: string;
}) {
  return (
    <Annulable
      libelle={`${actif ? "Éteindre" : "Rendre actif"} · ${nom}`}
      message={actif ? "Compte éteint." : "Compte actif."}
      className={actif ? "bouton-second" : "bouton"}
      action={() => allumerCompte(code, !actif)}
    />
  );
}
