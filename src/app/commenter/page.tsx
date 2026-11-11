import type { Metadata } from "next";
import { interrupteurAllume } from "@/donnees";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { EnTete } from "@/components/gabarit/EnTete";
import { exigerSession } from "@/services/auth";
import { compteAjoute } from "./actions";
import { BoutonArchiver, BoutonFait } from "./Boutons";
import { RESEAUX } from "./reseaux";
import { comptesDuJour, listeComplete } from "./rotation";

export const metadata: Metadata = { title: "Ma communauté" };
export const dynamic = "force-dynamic";

const nomReseau = (code: string) => RESEAUX.find(([c]) => c === code)?.[1] ?? code;

export default async function Page() {
  await exigerSession();
  if (!(await interrupteurAllume("commenter.allume"))) {
    return <EcranEteint code="commenter.allume" />;
  }
  const [duJour, liste] = await Promise.all([comptesDuJour(), listeComplete()]);
  const aVenir = liste.filter((c) => !duJour.some((d) => d.code === c.code));
  return (
    <section className="flex flex-col gap-6">
      <EnTete titre="Ma communauté" phrase="Les comptes chez qui commenter aujourd'hui : ouvrez-en un, écrivez votre commentaire vous-même, puis touchez « Fait ». Rien n'est envoyé d'ici." />
      {duJour.length === 0 ? (
        <p className="font-semibold">Votre liste est vide. Ajoutez un premier compte ci-dessous.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {duJour.map((c) => (
            <li key={c.code} className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
              <h2 className="text-xl font-bold">{c.nom}</h2>
              <p className="text-texte-doux">{nomReseau(c.reseau)}</p>
              {c.note ? <p>{c.note}</p> : null}
              {c.fait_le ? (
                <p className="font-bold">Fait aujourd&apos;hui.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {c.lien ? (
                    <a href={c.lien} target="_blank" rel="noopener noreferrer" className="bouton">
                      Ouvrir
                    </a>
                  ) : null}
                  <BoutonFait code={c.code} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-2xl border border-trait bg-surface p-4">
        <summary className="min-h-11 cursor-pointer text-lg font-bold">Ajouter un compte à ma liste</summary>
        <form action={compteAjoute} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            Réseau
            <select name="reseau" defaultValue="linkedin" className="min-h-11 rounded-lg border border-trait bg-white px-3 text-base">
              {RESEAUX.map(([code, nom]) => (
                <option key={code} value={code}>
                  {nom}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Nom du compte
            <input name="nom" required maxLength={120} className="min-h-11 rounded-lg border border-trait bg-white px-3 text-base" />
          </label>
          <label className="flex flex-col gap-1">
            Adresse de la page (commence par https://)
            <input name="lien" type="url" maxLength={500} className="min-h-11 rounded-lg border border-trait bg-white px-3 text-base" />
          </label>
          <label className="flex flex-col gap-1">
            Note pour vous (facultatif)
            <input name="note" maxLength={300} className="min-h-11 rounded-lg border border-trait bg-white px-3 text-base" />
          </label>
          <button type="submit" className="bouton">
            Ajouter
          </button>
        </form>
      </details>

      {aVenir.length > 0 ? (
        <details className="rounded-2xl border border-trait bg-surface p-4">
          <summary className="min-h-11 cursor-pointer text-lg font-bold">Le reste de ma liste</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {aVenir.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {c.nom} · {nomReseau(c.reseau)}
                </span>
                <BoutonArchiver code={c.code} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
