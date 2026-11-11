"use client";

import { Annulable } from "@/components/Annulable";
import { allumerMetier, allumerSecteur, validerMetier } from "./actions";

export function BoutonMetier({ code, allume }: { code: string; allume: boolean }) {
  return (
    <Annulable
      libelle={allume ? "Éteindre" : "Allumer"}
      message={allume ? "Métier éteint." : "Métier allumé."}
      className={allume ? "bouton-second" : "bouton"}
      action={() => allumerMetier(code, !allume)}
    />
  );
}

export function BoutonSecteur({ secteur, allumer }: { secteur: string; allumer: boolean }) {
  return (
    <Annulable
      libelle={allumer ? "Tout allumer" : "Tout éteindre"}
      message={allumer ? "Secteur allumé." : "Secteur éteint."}
      className="bouton-second"
      action={() => allumerSecteur(secteur, allumer)}
    />
  );
}

export function BoutonValider({ code }: { code: string }) {
  return <Annulable libelle="Valider ce métier" message="Métier validé." className="bouton" action={() => validerMetier(code)} />;
}
