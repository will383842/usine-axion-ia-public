"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BoutonCopier } from "@/components/ui";
import { montrerSecret, premierCode, type EtatPremierCode, type EtatSecret } from "./actions";

/**
 * N-26 · Enregistrement imposé d'un téléphone : le secret (une seule fois), puis le premier code, puis les codes de
 * secours (une seule fois). Recharger la page efface ce qui était montré : il faut alors demander un nouveau secret.
 * `ouverte` : la session est complète (l'enregistrement vient de l'ouvrir, ou Will revient sur /connexion).
 */
export function FormulaireEnregistrement({ suite, ouverte }: { suite: string; ouverte: boolean }) {
  const [secret, montrer, enCoursSecret] = useActionState<EtatSecret>(montrerSecret, { message: null });
  const [fin, confirmer, enCours] = useActionState<EtatPremierCode, FormData>(premierCode, { message: null });

  if (fin.codesSecours) {
    return (
      <div className="flex flex-col gap-4">
        <p>Votre téléphone est enregistré. Voici vos 10 codes de secours : ils servent si vous perdez votre téléphone, chacun une seule fois.</p>
        <p className="font-semibold">Notez-les maintenant, hors de ce téléphone : ils ne seront plus jamais affichés.</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-lg">
          {fin.codesSecours.map((c) => (
            <li key={c} className="rounded-lg bg-surface px-3 py-2 text-center">
              {c}
            </li>
          ))}
        </ul>
        <div className="self-start">
          <BoutonCopier texte={fin.codesSecours.join("\n")} quoi="les codes de secours" />
        </div>
        <Link href={suite} className="bouton">
          J&apos;ai noté mes codes : entrer
        </Link>
      </div>
    );
  }

  if (ouverte) {
    return (
      <Link href={suite} className="bouton">
        Entrer
      </Link>
    );
  }

  if (!secret.secret) {
    return (
      <form action={montrer} className="flex flex-col gap-4">
        <p>Pour protéger l&apos;Usine, la connexion demande aussi un code donné par une application de votre téléphone (Google Authenticator, Microsoft Authenticator, 2FAS…). Aucun SMS.</p>
        <p>Le secret à donner à cette application ne s&apos;affiche qu&apos;une seule fois.</p>
        {secret.message && <Alerte message={secret.message} />}
        <button type="submit" className="bouton" disabled={enCoursSecret}>
          {enCoursSecret ? "Un instant…" : "Montrer mon secret"}
        </button>
      </form>
    );
  }

  return (
    <form action={confirmer} className="flex flex-col gap-4">
      <p>Ajoutez l&apos;Usine dans votre application : touchez le lien sur ce téléphone, ou recopiez le secret à la main.</p>
      <a href={secret.lien} className="bouton-second">
        Ouvrir dans mon application
      </a>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 font-mono text-lg">{secret.secret.match(/.{1,4}/g)?.join(" ")}</code>
        <BoutonCopier texte={secret.secret} quoi="le secret" />
      </div>
      <label className="flex flex-col gap-2 font-semibold">
        Code à 6 chiffres affiché par l&apos;application
        <input className="champ font-mono text-lg" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </label>
      {fin.message && <Alerte message={fin.message} />}
      <button type="submit" className="bouton" disabled={enCours}>
        {enCours ? "Un instant…" : "Enregistrer mon téléphone"}
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
