"use client";

import { Annulable } from "@/components/Annulable";
import { allumerCompte } from "./actions";

export function BoutonCompte({
  code,
  actif,
}: {
  code: string;
  actif: boolean;
}) {
  return (
    <Annulable
      libelle={actif ? "Éteindre" : "Allumer"}
      message={actif ? "Compte éteint." : "Compte allumé."}
      className={actif ? "bouton-second" : "bouton"}
      action={() => allumerCompte(code, !actif)}
    />
  );
}
