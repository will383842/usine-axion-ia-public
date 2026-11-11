"use client";

import { Annulable } from "@/components/Annulable";
import { CLASSE_DISCRET } from "@/components/ui/BoutonPrincipal";
import { carteFaite } from "./actions";

export function BoutonFait({ id }: { id: string }) {
  return <Annulable libelle="C'est fait" message="Carte rangée." className={CLASSE_DISCRET} action={() => carteFaite(id)} />;
}
