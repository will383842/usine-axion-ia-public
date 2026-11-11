"use client";

import { Annulable } from "@/components/Annulable";
import { allumerTousLesEcrans } from "@/components/gabarit/actions";

export function BoutonTous() {
  return <Annulable libelle="Allumer tous les écrans" message="Écrans allumés." className="bouton" action={allumerTousLesEcrans} />;
}
