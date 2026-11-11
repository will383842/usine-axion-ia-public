import type { Metadata } from "next";
import { EnTete, Onglets } from "@/components/gabarit/EnTete";
import { chiffresCrmEnRetard } from "@/agregats";
import { secretAgregats } from "@/agregats/signature";
import { exigerSession } from "@/services/auth";
import { EcranChiffres } from "../chiffres/EcranChiffres";
import { EcranAgregats } from "./EcranAgregats";
import { EcranCadeaux, EcranMots } from "./EcranMots";

export const metadata: Metadata = { title: "Mes mots et cadeaux" };
export const dynamic = "force-dynamic";

const ONGLETS = [
  { cle: "mots", libelle: "Mots et messages", href: "/mots" },
  { cle: "cadeaux", libelle: "Cadeaux", href: "/mots?onglet=cadeaux" },
  { cle: "demandes", libelle: "Demandes reçues", href: "/mots?onglet=demandes" },
  { cle: "agregats", libelle: "Mots en commentaire", href: "/mots?onglet=agregats" },
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ onglet?: string; semaine?: string }> }) {
  await exigerSession();
  const { onglet, semaine } = await searchParams;
  const actif = onglet === "cadeaux" || onglet === "demandes" || onglet === "agregats" ? onglet : "mots";
  // Texte du bandeau : « CRM » est un mot interdit à l'écran (lexique C14), voir la description de la PR. Bandeau calculé à l'affichage (aucune minuterie, aucune alerte sortante) ; la route entrante éteinte (pas de secret) : pas de bandeau.
  const enRetard = secretAgregats() !== null && (await chiffresCrmEnRetard());
  return (
    <section className="flex flex-col gap-6">
      <EnTete
        titre="Mes mots et cadeaux"
        phrase="Les mots que l'on écrit en commentaire pour recevoir un cadeau, les messages envoyés en retour, et les demandes reçues chaque semaine."
      />
      {enRetard ? (
        <p role="status" className="rounded-xl border border-trait bg-surface p-4 font-semibold">
          Chiffres des demandes en retard : les derniers chiffres reçus datent d&apos;avant hier.
        </p>
      ) : null}
      <Onglets onglets={ONGLETS} actif={actif} />
      {actif === "cadeaux" ? <EcranCadeaux /> : actif === "agregats" ? <EcranAgregats /> : actif === "demandes" ? <EcranChiffres semaine={semaine} /> : <EcranMots />}
    </section>
  );
}
