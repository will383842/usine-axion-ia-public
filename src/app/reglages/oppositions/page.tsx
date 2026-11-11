import type { Metadata } from "next";
import { RESEAUX } from "@/contrats";
import { interrupteurAllume } from "@/donnees";
import { cleLisible, INTERRUPTEUR_OPPOSITION, listerOppositions } from "@/opposition";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { exigerSession } from "@/services/auth";
import { FormulaireOpposition } from "./FormulaireOpposition";

export const metadata: Metadata = { title: "Personnes qui ont dit STOP" };

const CANAL: Record<string, string> = { tous: "Tous les canaux", instagram: "Instagram", facebook: "Facebook", email: "E-mail" };
const SOURCE: Record<string, string> = { will: "Vous", "zernio-stop": "STOP reçu par l'outil d'envoi", site: "Le site" };
const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

export default async function Page() {
  await exigerSession();
  const allume = await interrupteurAllume(INTERRUPTEUR_OPPOSITION);
  if (!allume) {
    return <EcranEteint code="opposition" />;
  }
  const oppositions = await listerOppositions();
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">Personnes qui ont dit STOP</h1>
        <p className="text-texte-doux">
          Une personne opposée ne reçoit plus rien sur ce canal. Une adresse n&apos;est jamais gardée : seule son empreinte l&apos;est. Une opposition ne
          se retire pas.
        </p>
      </section>
      <FormulaireOpposition reseaux={RESEAUX} />
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Déjà opposées</h2>
        {oppositions.length === 0 ? (
          <p className="text-texte-doux">Aucune opposition pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {oppositions.map((o) => (
              <li key={o.id} className="flex flex-col gap-1 rounded-xl border border-trait bg-surface px-4 py-3">
                <span className="font-semibold break-all">{cleLisible(o.cle)}</span>
                <span className="text-texte-doux">
                  {CANAL[o.canal] ?? o.canal} · {SOURCE[o.source] ?? o.source} · depuis le {date.format(o.depuis)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
