"use client";

import { useActionState } from "react";
import { ChampMotDePasse } from "@/components/ChampMotDePasse";
import { envoyerEssai, validerEssai, type EtatEssai } from "./actions";

function Alerte({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
      {message}
    </p>
  );
}

/** SCC-3 · Essai de mise en service : mot de passe retapé, code reçu par courriel, puis l'interrupteur s'allume. */
export function EssaiCourriel() {
  const [envoi, envoyer, enEnvoi] = useActionState<EtatEssai, FormData>(envoyerEssai, { message: null });
  const [verif, valider, enVerif] = useActionState<EtatEssai, FormData>(validerEssai, { message: null });

  if (verif.etape === "fini") return <p role="status" className="rounded-lg bg-mocha px-3 py-2 font-semibold text-sur-mocha">C&apos;est réussi : le second code par courriel est allumé. Vous restez connecté.</p>;

  if (envoi.etape === "code") {
    return (
      <form action={valider} className="flex flex-col gap-4">
        <p>Un code vient d&apos;être envoyé à votre adresse habituelle. Il vaut 10 minutes.</p>
        <label className="flex flex-col gap-2 font-semibold">
          Code à 8 chiffres
          <input className="champ font-mono text-lg" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{8,9}" maxLength={9} required autoFocus />
        </label>
        {verif.message && <Alerte message={verif.message} />}
        <button type="submit" className="bouton" disabled={enVerif}>
          {enVerif ? "Un instant…" : "Valider"}
        </button>
        <p className="text-texte-doux">Pas reçu ? Regardez dans les indésirables : c&apos;est justement ce que cet essai vérifie.</p>
      </form>
    );
  }

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 font-semibold">
        Retapez votre mot de passe
        <ChampMotDePasse className="champ" name="motDePasse" autoComplete="current-password" required />
      </label>
      {envoi.message && <Alerte message={envoi.message} />}
      <button type="submit" className="bouton" disabled={enEnvoi}>
        {enEnvoi ? "Un instant…" : "Essayer le code par courriel"}
      </button>
    </form>
  );
}
