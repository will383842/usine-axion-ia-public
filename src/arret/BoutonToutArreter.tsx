"use client";

import { Annulable } from "@/components/Annulable";
import { reprendreTout, toutArreter } from "./actions";

/** Bouton « Tout arrêter » / « Reprendre » (Annuler 10 s). Pas encore posé sur l'écran des interrupteurs : voir la note de la PR. */
export function BoutonToutArreter({ arrete }: { arrete: boolean }) {
  return arrete ? (
    <Annulable libelle="Reprendre" message="Reprise en cours." className="bouton" action={reprendreTout} />
  ) : (
    <Annulable libelle="Tout arrêter" message="Tout est arrêté." className="bouton" action={toutArreter} />
  );
}
