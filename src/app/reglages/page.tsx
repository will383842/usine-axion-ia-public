import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/gabarit/EnTete";
import { derniereErreurBases } from "@/import/automatique";
import { exigerSession } from "@/services/auth";

export const metadata: Metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

interface Ligne {
  href: string;
  titre: string;
  aide: string;
  /** Pages de détail rangées sous cette ligne. */
  details?: { href: string; titre: string }[];
}

const LIGNES: Ligne[] = [
  {
    href: "/reglages/rythmes",
    titre: "Rythmes et parts par réseau",
    aide: "Combien de publications par semaine sur chaque réseau, et la part de chaque format.",
    details: [
      { href: "/reglages/rythmes", titre: "Rythmes de publication" },
      { href: "/reglages/parts", titre: "Parts par format" },
      { href: "/reglages/tirage", titre: "Poids et plafond" },
    ],
  },
  { href: "/reglages/comptes", titre: "Mes comptes", aide: "Le lien du profil de chacun de vos comptes." },
  { href: "/reglages/oppositions", titre: "Personnes qui ont dit STOP", aide: "Les personnes qui ne veulent plus rien recevoir : on ne leur écrit plus jamais." },
  { href: "/reglages/mot-de-passe", titre: "Mon mot de passe", aide: "Changer le mot de passe de l'Usine." },
];

const TECHNICIEN: Ligne[] = [
  { href: "/reglages/bases", titre: "Bases", aide: "Les fichiers d'où viennent vos métiers et vos sujets. Ils se chargent seuls au démarrage." },
  { href: "/reglages/interrupteurs", titre: "Interrupteurs", aide: "Allumer ou éteindre chaque écran et chaque fonction." },
];

function Carte({ l }: { l: Ligne }) {
  if (!l.details) {
    return (
      <Link href={l.href} className="flex min-h-11 flex-col gap-1 rounded-2xl border border-trait bg-surface p-4">
        <span className="text-lg font-bold">{l.titre}</span>
        <span className="text-texte-doux">{l.aide}</span>
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-trait bg-surface p-4">
      <span className="text-lg font-bold">{l.titre}</span>
      <span className="text-texte-doux">{l.aide}</span>
      <div className="flex flex-wrap gap-x-4">
        {l.details.map((d) => (
          <Link key={d.href} href={d.href} className="inline-flex min-h-11 items-center font-semibold underline">
            {d.titre}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function Page() {
  await exigerSession();
  const erreurBases = await derniereErreurBases();
  return (
    <section className="flex flex-col gap-6">
      <EnTete titre="Réglages" phrase="Ce que vous réglez une fois et retouchez rarement." />
      <ul className="flex flex-col gap-3">
        {LIGNES.map((l) => (
          <li key={l.href}>
            <Carte l={l} />
          </li>
        ))}
      </ul>
      <details open={Boolean(erreurBases)} className="rounded-2xl border border-trait p-4">
        <summary className="min-h-11 cursor-pointer content-center text-lg font-bold">Pour le technicien</summary>
        {erreurBases ? (
          <p role="alert" className="mt-3 rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
            Les bases n&apos;ont pas pu se charger. Le détail est dans « Bases ».
          </p>
        ) : null}
        <ul className="mt-3 flex flex-col gap-3">
          {TECHNICIEN.map((l) => (
            <li key={l.href}>
              <Carte l={l} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
