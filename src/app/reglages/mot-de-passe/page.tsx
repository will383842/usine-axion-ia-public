import type { Metadata } from "next";
import { exigerSession, sourceMotDePasse } from "@/services/auth";
import { MESSAGE_VARIABLE } from "@/lib/mot-de-passe";
import { FormulaireChangement } from "./FormulaireChangement";

export const metadata: Metadata = { title: "Changer mon mot de passe" };

export default async function Page() {
  await exigerSession();
  const source = await sourceMotDePasse();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Changer mon mot de passe</h1>
      {source === "variable" ? <p>{MESSAGE_VARIABLE}</p> : <FormulaireChangement />}
    </section>
  );
}
