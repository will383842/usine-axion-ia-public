import type { Metadata } from "next";
import { etatConnexion } from "@/services/auth";
import { FormulaireConnexion } from "./FormulaireConnexion";
import { FormulaireEnregistrement } from "./FormulaireEnregistrement";
import { FormulairePremiereOuverture } from "./FormulairePremiereOuverture";
import { FormulaireSecondCode } from "./FormulaireSecondCode";
import { suiteSure } from "@/lib/suite-sure";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion({ searchParams }: PageProps<"/connexion">) {
  const { suite } = await searchParams;
  const etat = await etatConnexion();
  const retour = suiteSure(suite);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <p className="self-start rounded-full bg-terracotta px-4 py-2 font-titre text-lg font-bold text-sur-terracotta">Usine Axion</p>
      {etat === "connexion" && (
        <>
          <h1 className="text-3xl font-bold">Bonjour Will</h1>
          <FormulaireConnexion suite={retour} />
        </>
      )}
      {etat === "premiere" && (
        <>
          <h1 className="text-3xl font-bold">Choisissez votre mot de passe</h1>
          <FormulairePremiereOuverture />
        </>
      )}
      {/* Même place pour « enregistrer » et « ouverte » : l'enregistrement ouvre la session, la page se recharge, et
          le formulaire garde à l'écran les codes de secours qu'il vient de recevoir (ils ne sont montrés qu'une fois). */}
      {(etat === "enregistrer" || etat === "ouverte") && (
        <>
          <h1 className="text-3xl font-bold">{etat === "ouverte" ? "Vous êtes connecté" : "Enregistrez votre téléphone"}</h1>
          <FormulaireEnregistrement suite={retour} ouverte={etat === "ouverte"} />
        </>
      )}
      {etat === "second-code" && (
        <>
          <h1 className="text-3xl font-bold">Votre code</h1>
          <FormulaireSecondCode suite={retour} />
        </>
      )}
      {etat === "fermee" && <h1 className="text-3xl font-bold">L&apos;Usine n&apos;est pas encore ouverte.</h1>}
    </main>
  );
}
