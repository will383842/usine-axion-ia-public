import type { Metadata } from "next";
import Link from "next/link";
import { PLAFOND_AUTO_MAX_CENTS } from "@/contrats";
import { interrupteurAllume } from "@/donnees";
import { lirePlafondAutomatique } from "@/reglages/plafond-automatique";
import { exigerSession } from "@/services/auth";
import { FormulairePlafond } from "./FormulairePlafond";

export const metadata: Metadata = { title: "Plafond des achats automatiques" };
export const dynamic = "force-dynamic";

const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

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
        <h1 className="text-3xl font-bold">Plafond des achats automatiques</h1>
        <p>Cet écran est éteint.</p>
        <Link href="/reglages/interrupteurs" className="inline-flex min-h-11 items-center font-semibold underline">
          Ouvrir les interrupteurs
        </Link>
      </section>
    );
  }
  const dernier = await lirePlafondAutomatique();
  const borne = euros.format(PLAFOND_AUTO_MAX_CENTS / 100);
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">Plafond des achats automatiques</h1>
        <p className="text-texte-doux">Ce que l&apos;Usine pourra dépenser seule chaque mois, quand vous l&apos;aurez autorisée.</p>
        <p className="font-semibold">
          {dernier
            ? `Dernier plafond accepté par le Studio : ${euros.format(dernier.plafond_cents / 100)} € par mois (le ${date.format(new Date(dernier.accepte_le))}).`
            : "Aucun plafond envoyé pour l'instant."}
        </p>
      </section>
      <section role="status" className="rounded-xl border border-trait bg-surface p-4">
        <p className="font-semibold">Achats automatiques : éteints.</p>
        <p>Chaque dépense de l&apos;Usine vous demande votre accord. Vous seul pourrez les allumer.</p>
      </section>
      <section className="rounded-xl border border-trait bg-surface p-4">
        <p className="font-semibold">Avant d&apos;envoyer</p>
        <p>
          Bon à savoir : au premier envoi accepté, le Studio bascule à sens unique : le plafond est désormais piloté par l&apos;Usine, et l&apos;interrupteur « L&apos;Usine en automatique » de Studio &gt; Réglages devient sans effet.
        </p>
      </section>
      <FormulairePlafond initial={dernier ? enSaisie(dernier.plafond_cents) : "0"} aide={`Entre 0 et ${borne} €. 0 : l'Usine ne dépense rien seule.`} />
      <p className="text-texte-doux">Vos commandes faites à la main ne sont jamais bloquées.</p>
    </div>
  );
}
