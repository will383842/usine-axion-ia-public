import Link from "next/link";
import { depots, interrupteurAllume } from "@/donnees";
import { requete } from "@/lib/base";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { BoutonMetier, BoutonSecteur } from "./Boutons";
import { INTERRUPTEUR_METIERS } from "./calculs";

const sansAccent = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Onglet « Mes métiers » de « Mes idées de sujets » (la session est vérifiée par la page). */
export async function EcranMetiers({ recherche: demandee }: { recherche: string }) {
  if (!(await interrupteurAllume(INTERRUPTEUR_METIERS))) {
    return <EcranEteint code="metiers" dansOnglet />;
  }
  const q = demandee.trim().slice(0, 80);
  const [secteurs, metiers, avancements] = await Promise.all([
    depots.secteur.lister({ ordre: "nom" }),
    depots.metier.lister({ ordre: "nom" }),
    requete<{ metier: string; cases: string; publiees: string }>(
      `SELECT c.cible AS metier, count(*) AS cases,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM lot_ligne l WHERE l.cas_usage = c.code AND l.etat = 'publiee' AND l.archive_le IS NULL)) AS publiees
         FROM cas_usage c WHERE c.etat <> 'retire' GROUP BY c.cible`,
    ),
  ]);
  const avance = new Map(avancements.map((a) => [a.metier, a]));
  const recherche = sansAccent(q);
  const visibles = recherche ? metiers.filter((m) => sansAccent(`${m.nom ?? ""} ${m.code}`).includes(recherche)) : metiers;
  const parSecteur = Map.groupBy(visibles, (m) => m.secteur ?? "");
  const groupes = secteurs
    .filter((s) => parSecteur.has(s.code))
    .map((s) => ({ code: s.code, nom: s.nom, metiers: parSecteur.get(s.code)! }));
  const connus = new Set(secteurs.map((s) => s.code));
  for (const [code, liste] of parSecteur) if (!connus.has(code)) groupes.push({ code, nom: code || "Autres", metiers: liste });
  const allumes = metiers.filter((m) => m.allume).length;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Mes métiers</h2>
        <p className="text-texte-doux">
          {allumes} métier{allumes > 1 ? "s" : ""} allumé{allumes > 1 ? "s" : ""} sur {metiers.length}. Un métier éteint n&apos;est jamais choisi.
        </p>
      </div>
      <form method="get" action="/sujets" className="flex flex-col gap-3 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">
          Chercher un métier
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Chercher un métier" className="champ" />
        <button type="submit" className="bouton-second">
          Chercher
        </button>
      </form>
      {groupes.length === 0 ? <p className="text-texte-doux">{q ? "Aucun métier ne correspond." : "Vos métiers se chargent seuls au démarrage de l'Usine. Revenez dans un instant."}</p> : null}
      <div className="flex flex-col gap-4">
        {groupes.map((g) => {
          const nb = g.metiers.filter((m) => m.allume).length;
          const toutAllume = nb === g.metiers.length;
          return (
            <details key={g.code} open={Boolean(q)} className="rounded-2xl border border-trait bg-surface">
              <summary className="flex min-h-11 cursor-pointer flex-col gap-1 p-4">
                <span className="text-lg font-bold">{g.nom}</span>
                <span className="text-texte-doux">
                  {nb} allumé{nb > 1 ? "s" : ""} sur {g.metiers.length}
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t border-trait p-4">
                <div>
                  <BoutonSecteur secteur={g.code} allumer={!toutAllume} />
                </div>
                <ul className="flex flex-col gap-4">
                  {g.metiers.map((m) => {
                    const a = avance.get(m.code);
                    return (
                      <li key={m.code} className="flex flex-col gap-2 border-t border-trait pt-4 first:border-t-0 first:pt-0">
                        <Link href={`/metiers/${encodeURIComponent(m.code)}`} className="flex min-h-11 flex-col justify-center font-semibold underline">
                          {m.nom ?? m.code}
                        </Link>
                        <p className="text-texte-doux">
                          {m.allume ? "Allumé" : "Éteint"} · {m.etat === "valide" ? "validé" : "à valider"}
                          {a ? ` · ${a.publiees} cas publiés sur ${a.cases}` : ""}
                        </p>
                        <div>
                          <BoutonMetier code={m.code} allume={m.allume} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
