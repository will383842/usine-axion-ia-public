import { LIGNES_PLAFONDS_VIDEO, PHRASE_PLAFONDS_VIDEO } from "@/reglages/plafonds-video";

/** Rappel en lecture seule des plafonds par vidéo : aucun champ, rien à enregistrer. */
export function PlafondsVideo() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
      <h2 className="text-lg font-bold">Plafonds par vidéo</h2>
      <ul className="flex flex-col gap-2">
        {LIGNES_PLAFONDS_VIDEO.map((l) => (
          <li key={l.libelle}>
            <span className="font-semibold">{l.libelle}</span> : {l.texte}
          </li>
        ))}
      </ul>
      <p className="text-texte-doux">{PHRASE_PLAFONDS_VIDEO}</p>
    </section>
  );
}
