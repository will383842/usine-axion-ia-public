"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ENTREES_RECHERCHE, estRaccourciRecherche, rechercher } from "./recherche";

/** Recherche d'une page par Ctrl K (ou Cmd K) : on tape, on choisit avec les flèches, Entrée ouvre, Échap ferme. */
export function RechercheCtrlK({ ouvert, surChangement }: { ouvert: boolean; surChangement: (ouvert: boolean) => void }) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (!estRaccourciRecherche(e)) return;
      e.preventDefault();
      surChangement(!ouvert);
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert, surChangement]);

  return ouvert ? <Fenetre fermer={() => surChangement(false)} /> : null;
}

function Fenetre({ fermer }: { fermer: () => void }) {
  const routeur = useRouter();
  const [saisie, setSaisie] = useState("");
  const [choix, setChoix] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => champ.current?.focus(), []);
  const trouvees = rechercher(saisie, ENTREES_RECHERCHE);
  const actuel = Math.min(choix, Math.max(trouvees.length - 1, 0));
  const ouvrir = (href: string) => {
    fermer();
    routeur.push(href);
  };
  const surTouche = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") fermer();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setChoix(Math.min(actuel + 1, trouvees.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setChoix(Math.max(actuel - 1, 0));
    } else if (e.key === "Enter" && trouvees[actuel]) ouvrir(trouvees[actuel].href);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Chercher une page" onKeyDown={surTouche} className="fixed inset-0 z-30 flex items-start justify-center bg-texte/40 p-4 pt-[12vh]">
      <div className="flex max-h-[70vh] w-full max-w-lg flex-col gap-3 rounded-2xl bg-surface p-4 shadow-carte">
        <input
          ref={champ}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setChoix(0);
          }}
          placeholder="Que cherchez-vous ?"
          aria-label="Que cherchez-vous ?"
          className="champ"
        />
        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {trouvees.map((e, i) => (
            <li key={e.href}>
              <button
                type="button"
                onClick={() => ouvrir(e.href)}
                aria-current={i === actuel ? "true" : undefined}
                className="flex min-h-11 w-full flex-col justify-center rounded-xl px-3 py-2 text-left hover:bg-fond aria-[current=true]:bg-terracotta-doux"
              >
                <span className="font-bold">{e.libelle}</span>
                {e.phrase ? <span className="text-base text-texte-doux">{e.phrase}</span> : null}
              </button>
            </li>
          ))}
          {trouvees.length === 0 ? <li className="px-3 py-2 text-texte-doux">Aucune page ne correspond. Essayez un autre mot.</li> : null}
        </ul>
        <button type="button" onClick={fermer} className="bouton-second self-end">
          Fermer
        </button>
      </div>
    </div>
  );
}
