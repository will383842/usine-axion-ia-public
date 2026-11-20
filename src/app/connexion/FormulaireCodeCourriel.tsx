"use client";

import { useActionState, useEffect, useState } from "react";
import { codeCourriel, renvoyerCode, type EtatConnexion, type EtatRenvoi } from "./actions";

const ATTENTE_RENVOI_S = 60;

/** SCC-3 · Le code reçu par courriel : un champ, une action principale, « Renvoyer le code » après 60 s. */
export function FormulaireCodeCourriel({ suite }: { suite: string }) {
  const [etat, valider, enCours] = useActionState<EtatConnexion, FormData>(codeCourriel, { message: null });
  const [renvoi, renvoyer, enRenvoi] = useActionState<EtatRenvoi, FormData>(() => renvoyerCode(), { message: null });
  // Compte à rebours : `seconde` avance chaque seconde ; il repart à chaque renvoi réussi (état dérivé, sans effet).
  const [seconde, setSeconde] = useState(0);
  const [debut, setDebut] = useState(0);
  const [vu, setVu] = useState(renvoi);
  if (renvoi !== vu) {
    setVu(renvoi);
    if (renvoi.envoye) setDebut(seconde);
  }
  useEffect(() => {
    const t = setInterval(() => setSeconde((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const reste = Math.max(0, ATTENTE_RENVOI_S - (seconde - debut));

  return (
    <div className="flex flex-col gap-4">
      <form action={valider} className="flex flex-col gap-4">
        <input type="hidden" name="suite" value={suite} />
        <p>Un code vient d&apos;être envoyé à votre adresse habituelle. Il vaut 10 minutes.</p>
        <label className="flex flex-col gap-2 font-semibold">
          Code à 8 chiffres
          <input className="champ font-mono text-lg" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{8,9}" maxLength={9} required autoFocus />
        </label>
        {etat.message && <Alerte message={etat.message} />}
        <button type="submit" className="bouton" disabled={enCours}>
          {enCours ? "Un instant…" : "Valider"}
        </button>
      </form>
      <form action={renvoyer} className="flex flex-col gap-2">
        <p className="text-texte-doux">Pas reçu ? Regardez dans les indésirables, attendez une minute, puis touchez « Renvoyer le code ».</p>
        {renvoi.message && (renvoi.envoye ? <p role="status">{renvoi.message}</p> : <Alerte message={renvoi.message} />)}
        <button type="submit" className="min-h-11 self-start underline disabled:no-underline disabled:opacity-60" disabled={reste > 0 || enRenvoi}>
          {reste > 0 ? `Renvoyer le code (${reste} s)` : "Renvoyer le code"}
        </button>
      </form>
    </div>
  );
}

function Alerte({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
      {message}
    </p>
  );
}
