"use client";

import { Annulable } from "@/components/Annulable";
import { reprendreTout, toutArreter } from "./actions";

export function BoutonToutArreter({ arrete }: { arrete: boolean }) {
  return arrete ? (
    <Annulable libelle="Reprendre" message="Reprise en cours." className="bouton" action={reprendreTout} />
  ) : (
    <Annulable libelle="Tout arrêter" message="Tout est arrêté." className="bouton" action={toutArreter} />
  );
}
