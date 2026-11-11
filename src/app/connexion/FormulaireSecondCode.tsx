"use client";

import { useActionState, useState } from "react";
import { codeSecours, secondCode, type EtatConnexion } from "./actions";

/** N-26 · Le code de l'application du téléphone ; en cas de perte, un code de secours. */
export function FormulaireSecondCode({ suite }: { suite: string }) {
  const [etat, entrer, enCours] = useActionState<EtatConnexion, FormData>(secondCode, { message: null });
  const [etatSecours, secourir, enCoursSecours] = useActionState<EtatConnexion, FormData>(codeSecours, { message: null });
  const [perdu, setPerdu] = useState(false);

  if (perdu) {
    return (
      <form action={secourir} className="flex flex-col gap-4">
        <input type="hidden" name="suite" value={suite} />
        <p>Entrez un de vos codes de secours. Il ne servira qu&apos;une fois ; vous enregistrerez ensuite votre nouveau téléphone.</p>
        <label className="flex flex-col gap-2 font-semibold">
          Code de secours
          <input className="champ font-mono text-lg" name="code" autoComplete="off" autoCapitalize="none" spellCheck={false} required autoFocus />
        </label>
        {etatSecours.message && <Alerte message={etatSecours.message} />}
        <button type="submit" className="bouton" disabled={enCoursSecours}>
          {enCoursSecours ? "Un instant…" : "Utiliser ce code"}
        </button>
        <button type="button" className="min-h-11 self-start underline" onClick={() => setPerdu(false)}>
          Revenir au code du téléphone
        </button>
      </form>
    );
  }

  return (
    <form action={entrer} className="flex flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />
      <label className="flex flex-col gap-2 font-semibold">
        Code à 6 chiffres de votre application
        <input className="champ font-mono text-lg" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </label>
      {etat.message && <Alerte message={etat.message} />}
      <button type="submit" className="bouton" disabled={enCours}>
        {enCours ? "Un instant…" : "Entrer"}
      </button>
      <button type="button" className="min-h-11 self-start underline" onClick={() => setPerdu(true)}>
        J&apos;ai perdu mon téléphone
      </button>
    </form>
  );
}

function Alerte({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
      {message}
    </p>
  );
}
