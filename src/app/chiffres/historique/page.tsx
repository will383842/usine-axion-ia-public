import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/gabarit/EnTete";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { chiffresAllume, historiqueDesReleves } from "@/chiffres";
import { exigerSession } from "@/services/auth";

export const metadata: Metadata = { title: "Historique des chiffres" };
export const dynamic = "force-dynamic";

const jourLisible = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Lecture seule : aucune écriture, quel que soit l'appel. */
export default async function Page() {
  await exigerSession();
  if (!(await chiffresAllume())) return <EcranEteint code="chiffres" />;
  const groupes = await historiqueDesReleves();
  return (
    <section className="flex flex-col gap-6">
      <EnTete titre="Historique des chiffres" phrase="Chaque semaine notée, et chaque correction, avec sa date de saisie." />
      <Link href="/mots?onglet=demandes" className="bouton-second">
        Retour aux demandes reçues
      </Link>
      {groupes.length === 0 ? <p className="text-texte-doux">Rien de noté pour l&apos;instant.</p> : null}
      {groupes.map((g) => (
        <div key={`${g.mot}/${g.compte}`} className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">
            {g.mot} · {g.compte}
          </h2>
          <ul className="flex flex-col gap-2">
            {g.lignes.map((l, i) => (
              <li key={i} className="rounded-xl border border-trait bg-surface p-3">
                <p className="font-semibold">Semaine du {jourLisible(l.semaine)}</p>
                <p>
                  {l.commentaires} commentaires · {l.messages} messages · {l.demandes_guide} demandes de guide · {l.abonnes_gagnes} abonnés gagnés
                </p>
                <p className="text-texte-doux">Noté le {l.saisi_le}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
