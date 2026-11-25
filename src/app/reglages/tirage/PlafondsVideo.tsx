import { LIGNES_PLAFONDS_VIDEO, PHRASE_PLAFONDS_VIDEO } from "@/reglages/plafonds-video";
import { Bloc } from "../Champs";

/** Rappel en lecture seule des plafonds par vidéo : aucun champ, rien à enregistrer. */
export function PlafondsVideo() {
  return (
    <Bloc titre="Plafonds par vidéo">
      <ul className="flex flex-col gap-2">
        {LIGNES_PLAFONDS_VIDEO.map((l) => (
          <li key={l.libelle}>
            <span className="font-semibold">{l.libelle}</span> : {l.texte}
          </li>
        ))}
      </ul>
      <p className="text-texte-doux">{PHRASE_PLAFONDS_VIDEO}</p>
    </Bloc>
  );
}
