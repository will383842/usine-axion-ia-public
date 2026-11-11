"use client";

import { useActionState } from "react";
import { fixerObjectif, releverMot, type EtatSaisie } from "./actions";

const CHAMP = "min-h-11 w-full rounded-lg border border-trait bg-white px-3 text-base";
const DEPART: EtatSaisie = { message: null, ok: false };

function Message({ etat }: { etat: EtatSaisie }) {
  return etat.message ? (
    <p role={etat.ok ? "status" : "alert"} className={etat.ok ? "text-texte-doux" : "font-semibold"}>
      {etat.message}
    </p>
  ) : null;
}

interface Valeurs {
  commentaires: number;
  messages: number;
  demandes_guide: number;
  abonnes_gagnes: number;
}

/** Les quatre chiffres d'un mot sur un compte pour la semaine ; le champ vide vaut 0. */
export function FormulaireReleve({ semaine, mot, compte, nomCompte, valeurs }: { semaine: string; mot: string; compte: string; nomCompte: string; valeurs: Valeurs | null }) {
  const [etat, action, enCours] = useActionState<EtatSaisie, FormData>(releverMot, DEPART);
  const id = `${mot}-${compte}`.replace(/[^a-z0-9-]/g, "-");
  const champs: [keyof Valeurs, string, string][] = [
    ["commentaires", "commentaires", "Commentaires au mot"],
    ["messages", "messages", "Messages partis"],
    ["demandes_guide", "demandesGuide", "Demandes de guide"],
    ["abonnes_gagnes", "abonnesGagnes", "Abonnés gagnés"],
  ];
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
      <input type="hidden" name="semaine" value={semaine} />
      <input type="hidden" name="mot" value={mot} />
      <input type="hidden" name="compte" value={compte} />
      <h3 className="text-lg font-bold">{nomCompte}</h3>
      <div className="grid grid-cols-2 gap-3">
        {champs.map(([col, nom, libelle]) => (
          <label key={nom} htmlFor={`${id}-${nom}`} className="flex flex-col gap-1">
            {libelle}
            <input id={`${id}-${nom}`} name={nom} type="number" inputMode="numeric" min={0} step={1} defaultValue={valeurs ? valeurs[col] : 0} className={CHAMP} />
          </label>
        ))}
      </div>
      <button type="submit" disabled={enCours} className="bouton self-start">
        Enregistrer
      </button>
      <Message etat={etat} />
    </form>
  );
}

export function FormulaireObjectif({ compte, nomCompte, objectif }: { compte: string; nomCompte: string; objectif: string | null }) {
  const [etat, action, enCours] = useActionState<EtatSaisie, FormData>(fixerObjectif, DEPART);
  const id = `objectif-${compte}`.replace(/[^a-z0-9-]/g, "-");
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
      <input type="hidden" name="compte" value={compte} />
      <label htmlFor={id} className="flex flex-col gap-1 font-semibold">
        {nomCompte}
        <input id={id} name="objectif" maxLength={200} defaultValue={objectif ?? ""} placeholder="Votre objectif, avec vos mots" className={`${CHAMP} font-normal`} />
      </label>
      <button type="submit" disabled={enCours} className="bouton-second self-start">
        Enregistrer l&apos;objectif
      </button>
      <Message etat={etat} />
    </form>
  );
}
