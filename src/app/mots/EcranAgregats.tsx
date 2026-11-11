import { lireAgregats } from "@/agregats";
import { secretAgregats } from "@/agregats/signature";
import { COLONNES, vueParMot, type Total } from "@/agregats/vue";
import { aujourdhuiParis, ajouterJours } from "@/chiffres";
import { interrupteurAllume } from "@/donnees";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { EcranEteint } from "@/components/gabarit/EcranEteint";

const JOURS_AFFICHES = 14;
const jourLisible = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const cellule = (n: number | null) => (n === null ? "moins de 3" : String(n));
const total = (t: Total) => (t.masquee ? `au moins ${t.somme}` : String(t.somme));
const reseauLisible = (r: string) => (r in LIBELLE_RESEAU ? LIBELLE_RESEAU[r as keyof typeof LIBELLE_RESEAU] : r);

/** Onglet « Mots en commentaire » : lecture seule, rendu côté serveur, aucun JavaScript client. */
export async function EcranAgregats() {
  if (!(await interrupteurAllume("agregats.ecran"))) return <EcranEteint code="agregats.ecran" dansOnglet />;
  if (secretAgregats() === null) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-5">
        <h2 className="text-2xl font-bold">Réception éteinte</h2>
        <p>La réception des chiffres n&apos;est pas branchée : aucun chiffre ne peut arriver. Rien n&apos;est à faire ici.</p>
      </section>
    );
  }
  const aujourdhui = await aujourdhuiParis();
  const lignes = await lireAgregats(ajouterJours(aujourdhui, -JOURS_AFFICHES), ajouterJours(aujourdhui, -1));
  const mots = vueParMot(lignes);
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold">Mots en commentaire</h2>
      <p className="text-texte-doux">Les {JOURS_AFFICHES} derniers jours, mot par mot. Un chiffre inférieur à 3 n&apos;est pas donné : il s&apos;affiche « moins de 3 ».</p>
      {/* Le bandeau « chiffres en retard » est celui de la page, au-dessus des onglets. */}
      {mots.map((m) => (
        <section key={m.mot} aria-labelledby={`mot-${m.mot}`} className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
          <h3 id={`mot-${m.mot}`} className="text-xl font-bold">
            Mot {m.mot}
          </h3>
          {!m.recu ? (
            <p className="text-texte-doux">Aucun chiffre reçu pour ce mot.</p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-x-6 gap-y-1">
                {COLONNES.map((c) => (
                  <li key={c.cle}>
                    {c.libelle} : <strong>{total(m.totaux[c.cle])}</strong>
                  </li>
                ))}
              </ul>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Détail du mot ${m.mot}`}>
                <table className="w-full min-w-[22rem] text-left">
                  <caption className="sr-only">Chiffres du mot {m.mot} par jour et par compte</caption>
                  <thead>
                    <tr>
                      <th scope="col">Jour</th>
                      <th scope="col">Compte</th>
                      {COLONNES.map((c) => (
                        <th key={c.cle} scope="col">
                          {c.libelle}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.detail.map((d) => (
                      <tr key={`${d.jour}|${d.reseau}|${d.compte}`}>
                        <th scope="row">{jourLisible(d.jour)}</th>
                        <td>
                          {d.compte} · {reseauLisible(d.reseau)}
                        </td>
                        {COLONNES.map((c) => (
                          <td key={c.cle}>{cellule(d[c.cle])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ))}
    </section>
  );
}
