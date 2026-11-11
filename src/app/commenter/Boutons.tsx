"use client";

import { Annulable } from "@/components/Annulable";
import { compteArchive, compteFait } from "./actions";

export function BoutonFait({ code }: { code: string }) {
  return <Annulable libelle="Fait" message="Rangé pour aujourd'hui." action={() => compteFait(code)} className="bouton-second" />;
}

export function BoutonArchiver({ code }: { code: string }) {
  return <Annulable libelle="Archiver" message="Compte archivé." action={() => compteArchive(code)} />;
}
