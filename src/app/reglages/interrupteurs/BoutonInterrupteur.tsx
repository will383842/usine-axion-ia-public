"use client";

import { Annulable } from "@/components/Annulable";
import { changerInterrupteur } from "./actions";

export function BoutonInterrupteur({ code, allume }: { code: string; allume: boolean }) {
  return (
    <Annulable
      libelle={allume ? "Éteindre" : "Allumer"}
      message={allume ? "Éteint." : "Allumé."}
      className={allume ? "bouton-second" : "bouton"}
      action={() => changerInterrupteur(code, !allume)}
    />
  );
}
