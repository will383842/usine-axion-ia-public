import type { Metadata } from "next";
import Link from "next/link";
import { PLAFOND_AUTO_MAX_CENTS } from "@/contrats";
import { interrupteurAllume } from "@/donnees";
import { PLAFOND_DEPART_CENTS, lireAutonomieStudio, lirePlafondAutomatique } from "@/reglages/plafond-automatique";
import { LIGNES_PLAFONDS_VIDEO, PHRASE_PLAFONDS_VIDEO } from "@/reglages/plafonds-video";
import { exigerSession } from "@/services/auth";
import { FormulairePlafond } from "./FormulairePlafond";

export const metadata: Metadata = { title: "Ce que l'Usine dépense seule" };
export const dynamic = "force-dynamic";

const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const montant = (centimes: number) => `${euros.format(centimes / 100)} €`;

/** Centimes → saisie en euros, par la chaîne (« 2050 » → « 20,50 »). */
function enSaisie(centimes: number): string {
  const reste = centimes % 100;
  return reste === 0 ? String(Math.floor(centimes / 100)) : `${Math.floor(centimes / 100)},${String(reste).padStart(2, "0")}`;
}

export default async function Page() {
  await exigerSession();
  if (!(await interrupteurAllume("plafond.ecran"))) {
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-trait bg-surface p-5">
        <h1 className="text-3xl font-bold">Ce que l&apos;Usine dépense seule</h1>
        <p>Cet écran est éteint.</p>
        <Link href="/reglages/interrupteurs" className="inline-flex min-h-11 items-center font-semibold underline">
          Ouvrir les interrupteurs
        </Link>
      </section>
    );
  }
  const studio = await lireAutonomieStudio();
  const dernier = await lirePlafondAutomatique();
  const borne = montant(PLAFOND_AUTO_MAX_CENTS);
  const plafondInitial = studio.connu && studio.plafond_cents > 0 ? studio.plafond_cents : (dernier?.plafond_cents ?? PLAFOND_DEPART_CENTS) || PLAFOND_DEPART_CENTS;
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">Ce que l&apos;Usine dépense seule</h1>
        <p className="text-texte-doux">Le montant que l&apos;Usine peut dépenser seule chaque mois, sans vous demander. Vos commandes faites à la main ne sont jamais bloquées.</p>
      </section>
      <section role="status" className="flex flex-col gap-1 rounded-xl border border-trait bg-surface p-4">
        {studio.connu ? (
          <>
            <p className="font-semibold">{studio.automatique ? "Aujourd'hui : allumé." : "Aujourd'hui : éteint."}</p>
            <p>
              Dépensé ce mois-ci : {montant(studio.utilise_cents)} sur {montant(studio.plafond_cents)}.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">Dépensé ce mois-ci : inconnu.</p>
            <p>Le Studio ne répond pas : rien n&apos;est affiché ni envoyé pour l&apos;instant. Réessayez plus tard.</p>
          </>
        )}
      </section>
      {studio.connu && (
        <>
          <section className="rounded-xl border border-trait bg-surface p-4">
            <p className="font-semibold">Bon à savoir</p>
            <p>Une fois réglée ici, l&apos;autonomie ne se règle plus dans le Studio (sauf le bouton Éteindre). Vous pouvez donc l&apos;allumer, l&apos;éteindre et changer le plafond depuis cet écran seulement.</p>
            <p>Les plafonds par vidéo ci-dessous s&apos;ajoutent à ce plafond du mois.</p>
          </section>
          <FormulairePlafond
            key={`${studio.automatique}-${plafondInitial}`}
            allumeInitial={studio.automatique}
            initial={enSaisie(plafondInitial)}
            resume={`L'Usine pourra dépenser seule jusqu'à {plafond} € par mois, sans vous demander, puis s'arrêtera. Vous pourrez l'éteindre à tout moment ; « Tout arrêter » l'éteint aussi. Le plafond ne peut pas dépasser ${borne}.`}
          />
        </>
      )}
      <section className="flex flex-col gap-3 rounded-xl border border-trait bg-surface p-4">
        <h2 className="text-xl font-bold">Plafonds par vidéo</h2>
        <p className="text-texte-doux">{PHRASE_PLAFONDS_VIDEO}</p>
        <ul className="flex flex-col gap-2">
          {LIGNES_PLAFONDS_VIDEO.map((l) => (
            <li key={l.libelle}>
              <span className="font-semibold">{l.libelle} :</span> {l.texte}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
