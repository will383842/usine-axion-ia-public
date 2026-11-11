import type { Metadata } from "next";
import { EnTete, Onglets } from "@/components/gabarit/EnTete";
import { exigerSession } from "@/services/auth";
import { EcranMetiers } from "../metiers/EcranMetiers";
import { EcranNouveautes } from "../nouveautes/EcranNouveautes";

export const metadata: Metadata = { title: "Mes idées de sujets" };
export const dynamic = "force-dynamic";

const ONGLETS = [
  { cle: "metiers", libelle: "Mes métiers", href: "/sujets" },
  { cle: "nouveautes", libelle: "Nouveautés de la semaine", href: "/sujets?onglet=nouveautes" },
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ onglet?: string; q?: string }> }) {
  await exigerSession();
  const { onglet, q } = await searchParams;
  const actif = onglet === "nouveautes" ? "nouveautes" : "metiers";
  return (
    <section className="flex flex-col gap-6">
      <EnTete titre="Mes idées de sujets" phrase="Choisissez les métiers dont vos vidéos parlent, et gardez les nouveautés de la semaine qui valent une vidéo." />
      <Onglets onglets={ONGLETS} actif={actif} />
      {actif === "nouveautes" ? <EcranNouveautes /> : <EcranMetiers recherche={q ?? ""} />}
    </section>
  );
}
