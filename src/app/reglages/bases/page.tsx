import type { Metadata } from "next";
import Link from "next/link";
import { interrupteurAllume } from "@/donnees";
import { derniereErreurBases } from "@/import/automatique";
import { dernierRapport, INTERRUPTEUR_BASES, type RapportImport } from "@/import/importer";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { exigerSession } from "@/services/auth";
import { Recharger } from "./Recharger";

export const metadata: Metadata = { title: "Bases" };

const NOMS: Record<string, string> = {
  secteur: "Secteurs",
  metier: "Métiers",
  public: "Publics",
  douleur: "Douleurs",
  objection: "Objections",
  souci_releve: "Soucis relevés",
  taille: "Tailles d'entreprise",
  famille: "Familles de sujets",
  sujet: "Sujets",
  actualite: "Actualités",
  cas_usage: "Cas d'usage",
  format_video: "Formats de vidéo",
  format_autre: "Autres formats",
  publication: "Règles par réseau",
  appel: "Fins",
  voix: "Voix",
  interdit: "Interdits",
  fait: "Faits sourcés",
  accroche: "Accroches",
  compte: "Comptes",
};
const MAX_LIGNES_MONTREES = 50;

function date(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
}

function Rapport({ rapport }: { rapport: RapportImport }) {
  const total = (k: "ajoutees" | "mises_a_jour" | "retirees" | "refusees") => rapport.tables.reduce((n, t) => n + t[k], 0);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Dernier rechargement, le {date(rapport.le)}</h2>
      <p>
        {total("ajoutees")} ligne(s) ajoutée(s), {total("mises_a_jour")} mise(s) à jour, {total("retirees")} retirée(s),{" "}
        {total("refusees")} refusée(s).
        {rapport.depart.service + rapport.depart.compte > 0 &&
          ` Lignes de départ posées : ${rapport.depart.service} service(s), ${rapport.depart.compte} compte(s).`}
      </p>

      {rapport.fichiersRefuses.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-terracotta-doux p-4 text-terracotta-fonce">
          <h3 className="font-bold">Fichiers refusés en entier (rien n&apos;a été changé pour eux)</h3>
          {rapport.fichiersRefuses.map((f) => (
            <div key={f.fichier}>
              <p className="font-semibold">{f.fichier}</p>
              <ul className="list-disc pl-5">
                {f.raisons.map((r, i) => (
                  <li key={i} className="break-words">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ul className="flex flex-col divide-y divide-trait rounded-xl border border-trait bg-surface">
        {rapport.tables.map((t) => (
          <li key={t.table} className="flex flex-col gap-1 px-4 py-3">
            <span className="font-semibold">
              {NOMS[t.table] ?? t.table} <span className="font-normal text-texte-doux">· {t.lues} ligne(s) lue(s)</span>
            </span>
            <span className="text-texte-doux">
              {t.ajoutees} ajoutée(s) · {t.mises_a_jour} mise(s) à jour · {t.retirees} retirée(s) · {t.refusees} refusée(s)
            </span>
          </li>
        ))}
      </ul>

      {rapport.lignesRefusees.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Lignes refusées, et pourquoi</h3>
          <ul className="flex flex-col gap-1">
            {rapport.lignesRefusees.slice(0, MAX_LIGNES_MONTREES).map((l) => (
              <li key={`${l.fichier}-${l.numero}`} className="break-words">
                {l.fichier}, ligne {l.numero} ({l.code}) : {l.raison}
              </li>
            ))}
          </ul>
          {rapport.lignesRefusees.length > MAX_LIGNES_MONTREES && (
            <p className="text-texte-doux">Et {rapport.lignesRefusees.length - MAX_LIGNES_MONTREES} autre(s).</p>
          )}
        </div>
      )}

      {rapport.ignorees.includes("compte") && (
        <p className="text-texte-doux">Les comptes des bases ne sont pas repris : vos comptes réels sont tenus dans l&apos;Usine.</p>
      )}
    </section>
  );
}

export default async function Page() {
  await exigerSession();
  const [allume, erreur] = await Promise.all([interrupteurAllume(INTERRUPTEUR_BASES), derniereErreurBases()]);
  const alerte = erreur ? (
    <div role="alert" className="flex flex-col gap-1 rounded-xl bg-terracotta-doux p-4 text-terracotta-fonce">
      <p className="font-bold">Le dernier chargement des bases s&apos;est interrompu, le {date(new Date(erreur.le).toISOString())}. Rien n&apos;a changé.</p>
      <p className="break-words">{erreur.message}</p>
    </div>
  ) : null;

  if (!allume) {
    return (
      <div className="flex flex-col gap-6">
        {alerte}
        <EcranEteint code="bases.recharger" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reglages" className="inline-flex min-h-11 items-center font-semibold text-terracotta underline">
        ← Réglages
      </Link>
      <h1 className="text-3xl font-bold">Bases</h1>
      <p>
        Relit les fichiers des bases et met à jour vos métiers, douleurs, cas d&apos;usage, sujets, fins et accroches. Une ligne qui a
        disparu des fichiers est retirée, jamais effacée. L&apos;allumage de vos métiers ne change pas. Au démarrage de l&apos;Usine, les
        bases se rechargent seules quand leurs fichiers ont changé.
      </p>
      {alerte}
      <Recharger />
      <RapportOuRien />
    </div>
  );
}

async function RapportOuRien() {
  const rapport = await dernierRapport();
  if (!rapport) return <p className="text-texte-doux">Les bases n&apos;ont pas encore été chargées.</p>;
  return <Rapport rapport={rapport} />;
}
