import type { Metadata } from "next";
import { etatEssaiCourriel } from "@/services/auth";
import { EssaiCourriel } from "./EssaiCourriel";

export const metadata: Metadata = { title: "Second code" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const etat = await etatEssaiCourriel();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Second code par courriel</h1>
      {etat.allume ? (
        <p>Le second code par courriel est allumé : après votre mot de passe, un code arrive à votre adresse habituelle. Pour l&apos;éteindre, passez par « Interrupteurs ».</p>
      ) : (
        <p>Éteint : votre mot de passe seul ouvre l&apos;Usine. Faites l&apos;essai ci-dessous : s&apos;il réussit, le second code par courriel s&apos;allume et vous restez connecté.</p>
      )}
      {etat.application ? (
        <p role="alert" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
          Éteignez d&apos;abord « Second code à la connexion » (dans « Interrupteurs »).
        </p>
      ) : !etat.regle ? (
        <p role="alert" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
          L&apos;envoi de courriel n&apos;est pas encore réglé sur le serveur.
        </p>
      ) : (
        <EssaiCourriel />
      )}
      <p className="text-texte-doux">Votre boîte de courriel devient votre second code : protégez-la elle aussi par un second code.</p>
    </section>
  );
}
