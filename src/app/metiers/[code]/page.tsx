import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { depots, interrupteurAllume } from "@/donnees";
import { requete } from "@/lib/base";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { exigerSession } from "@/services/auth";
import { BoutonMetier, BoutonValider } from "../Boutons";
import { avancementParService, champsCalcules, estPhare, INTERRUPTEUR_METIERS, pointsATrancher, pourcent } from "../calculs";

export const metadata: Metadata = { title: "Fiche d'un métier" };
export const dynamic = "force-dynamic";

const liste = (v: string | null) => (v ?? "").split(";").map((s) => s.trim()).filter(Boolean);

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_METIERS))) return <EcranEteint code="metiers" />;
  const code = decodeURIComponent((await params).code);
  const metier = await depots.metier.lire(code);
  if (!metier || metier.etat === "retire") notFound();

  const [douleurs, cas, services, publies, secteur] = await Promise.all([
    depots.douleur.lister({ ou: { cible: code } }),
    depots.cas_usage.lister({ ou: { cible: code } }),
    depots.service.lister({ ordre: "ordre" }),
    requete<{ cas_usage: string }>(`SELECT DISTINCT cas_usage FROM lot_ligne WHERE metier = $1 AND etat = 'publiee' AND cas_usage IS NOT NULL AND archive_le IS NULL`, [code]),
    metier.secteur ? depots.secteur.lire(metier.secteur) : null,
  ]);
  const points = pointsATrancher(metier, douleurs, cas);
  const calcules = champsCalcules(metier, douleurs, cas);
  const phares = cas.filter(estPhare).sort((a, b) => (a.phare ?? "").localeCompare(b.phare ?? ""));
  const avance = avancementParService(cas, new Set(publies.map((p) => p.cas_usage)));
  const nomService = new Map(services.map((s) => [s.code, s.nom]));
  const aValider = metier.etat !== "valide" || douleurs.some((d) => d.etat !== "valide") || cas.some((c) => c.etat !== "valide");

  return (
    <section className="flex flex-col gap-6">
      <Link href="/sujets" className="inline-flex min-h-11 items-center underline">
        ← Tous les métiers
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{metier.nom ?? metier.code}</h1>
        <p className="text-texte-doux">
          {secteur?.nom ?? metier.secteur} · {metier.allume ? "Allumé" : "Éteint"} · {metier.etat === "valide" ? "Validé" : "À valider"}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <BoutonMetier code={metier.code} allume={metier.allume} />
        {aValider ? <BoutonValider code={metier.code} /> : null}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-trait bg-terracotta-doux p-4">
        <h2 className="text-xl font-bold">Points à trancher</h2>
        {points.length === 0 ? (
          <p>Rien à trancher pour ce métier.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {points.map((p) => (
              <li key={p.cle} className="flex flex-col gap-1">
                <p className="font-semibold">{p.texte}</p>
                {p.details.length ? (
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center underline">Voir lesquels</summary>
                    <ul className="list-disc pl-5">
                      {p.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {calcules.length ? (
          <div className="flex flex-col gap-1">
            <p className="font-semibold">Remplis par calcul, jamais relus :</p>
            <ul className="list-disc pl-5">
              {calcules.map((g) => (
                <li key={g.objet}>
                  {g.objet} ({g.nombre}) : {g.champs.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Avancement par service</h2>
        {avance.size === 0 ? <p className="text-texte-doux">Aucun cas pour ce métier.</p> : null}
        <ul className="flex flex-col gap-2">
          {[...avance].map(([service, a]) => (
            <li key={service} className="flex flex-col rounded-xl border border-trait bg-surface p-3">
              <span className="font-semibold">{nomService.get(service) ?? (service || "Sans service")}</span>
              <span className="text-texte-doux">
                {a.publiees} cas publiés sur {a.cases} ({pourcent(a)} %)
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Ses mots</h2>
        {liste(metier.mots).length ? <p>{liste(metier.mots).join(" · ")}</p> : <p className="text-texte-doux">Aucun mot noté.</p>}
        {liste(metier.se_nomment).length ? <p className="text-texte-doux">Ils se disent : {liste(metier.se_nomment).join(", ")}</p> : null}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Ses douleurs ({douleurs.length})</h2>
        <ul className="flex flex-col gap-2">
          {douleurs.map((d) => (
            <li key={d.code} className="rounded-xl border border-trait bg-surface p-3">
              <p>{d.dite}</p>
              <p className="text-texte-doux">{liste(d.services).map((s) => nomService.get(s) ?? s).join(", ") || "Aucun service relié"}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Ses cas phares ({phares.length})</h2>
        <ul className="flex flex-col gap-2">
          {phares.map((c) => (
            <li key={c.code} className="rounded-xl border border-trait bg-surface p-3">
              <p className="font-semibold">{c.titre}</p>
              <p className="text-texte-doux">{c.source?.trim() ? `Source : ${c.source}` : "Sans source"}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
