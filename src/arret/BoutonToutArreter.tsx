"use client";

import { Annulable } from "@/components/Annulable";
import { reprendreTout, toutArreter } from "./actions";

/** Bouton « Tout arrêter » / « Reprendre » (Annuler 10 s). Pas encore posé sur l'écran des interrupteurs : voir la note de la PR. */
export function BoutonToutArreter({ arrete }: { arrete: boolean }) {
  return arrete ? (
    <>
      <p className="mb-2 text-texte-doux">La reprise ne rallume pas ce que l&apos;Usine dépense seule : pour cela, allez dans Réglages.</p>
      <Annulable libelle="Reprendre" message="Reprise en cours." className="bouton" action={reprendreTout} />
    </>
  ) : (
    <>
      <p className="mb-2 text-texte-doux">« Tout arrêter » éteint aussi ce que l&apos;Usine dépense seule. Ensuite, seul l&apos;écran « Ce que l&apos;Usine dépense seule » peut le rallumer.</p>
      <Annulable libelle="Tout arrêter" message="Tout est arrêté, y compris ce que l'Usine dépense seule." className="bouton" action={toutArreter} />
    </>
  );
}
