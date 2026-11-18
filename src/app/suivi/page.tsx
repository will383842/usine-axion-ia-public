import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/gabarit/EnTete";
import { suiviAllume } from "@/suivi";
import { exigerSession } from "@/services/auth";

export const metadata: Metadata = { title: "Suivi de l'usine" };
export const dynamic = "force-dynamic";

const ECRANS = [
  { href: "/suivi/fiabilite", titre: "Fiabilité", phrase: "Les alertes de silence et la date du dernier relevé de chaque source." },
  { href: "/suivi/formats-sans-video", titre: "Formats sans vidéo", phrase: "Les carrousels, images, textes et stories, selon où ils en sont." },
  { href: "/suivi/site", titre: "Vidéos sur le site", phrase: "Cochez les vidéos qui sont sur le site. Décocher ne supprime rien." },
  { href: "/suivi/prospects", titre: "Prospects", phrase: "Des nombres par réseau, sans aucun nom ni coordonnée." },
  { href: "/suivi/stop", titre: "STOP et opposition", phrase: "Combien de personnes ont dit STOP, par réseau." },
] as const;

function Eteint({ titre }: { titre: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-trait bg-surface p-5">
      <h1 className="text-3xl font-bold">{titre}</h1>
      <p>Cet écran est éteint. Pour le voir, allumez « Écrans de suivi » dans les réglages.</p>
      <Link href="/reglages/interrupteurs" className="bouton self-start">
        Ouvrir les interrupteurs
      </Link>
    </section>
  );
}

export default async function Page() {
  await exigerSession();
  if (!(await suiviAllume())) return <Eteint titre="Suivi de l'usine" />;
  return (
    <div className="flex flex-col gap-6">
      <EnTete titre="Suivi de l'usine" phrase="Cinq écrans à lire : rien n'est envoyé d'ici." />
      <ul className="flex flex-col gap-3">
        {ECRANS.map((e) => (
          <li key={e.href}>
            <Link href={e.href} className="flex min-h-11 flex-col gap-1 rounded-2xl border border-trait bg-surface p-4">
              <span className="text-xl font-bold">{e.titre}</span>
              <span className="text-texte-doux">{e.phrase}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
