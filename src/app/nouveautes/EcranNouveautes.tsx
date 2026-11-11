import { aUneSource, lesNouveautes, lienDeLaSource, nouveautesAllume } from "@/nouveautes";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { BoutonEcarter, BoutonGarder } from "./Boutons";

type Nouveaute = Awaited<ReturnType<typeof lesNouveautes>>["proposees"][number];

const dateLisible = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null);

function Fiche({ n, gardee }: { n: Nouveaute; gardee: boolean }) {
  const lien = lienDeLaSource(n.source);
  const date = dateLisible(n.date_source);
  const limite = dateLisible(n.perime_le);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
      <h4 className="text-xl font-bold">{n.titre ?? n.code}</h4>
      {n.ce_qui_change_pour_un_dirigeant ? (
        <p>
          <span className="font-semibold">Ce que cela change pour vous : </span>
          {n.ce_qui_change_pour_un_dirigeant}
        </p>
      ) : null}
      <p className="text-texte-doux">
        Source : {aUneSource(n.source) ? n.source : "aucune"}
        {date ? ` · publiée le ${date}` : ""}
        {limite ? ` · à utiliser avant le ${limite}` : ""}
      </p>
      {lien ? (
        <a href={lien} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold underline">
          Ouvrir la source
        </a>
      ) : null}
      {gardee ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-bold">Gardée : elle entre dans votre prochaine commande.</p>
          <BoutonEcarter code={n.code} libelle="Ne plus la garder" />
        </div>
      ) : aUneSource(n.source) ? (
        <div className="flex flex-wrap items-start gap-3">
          <BoutonGarder code={n.code} />
          <BoutonEcarter code={n.code} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">Sans source, elle ne peut pas être gardée.</p>
          <div>
            <BoutonEcarter code={n.code} />
          </div>
        </div>
      )}
    </li>
  );
}

/** Onglet « Nouveautés de la semaine » de « Mes idées de sujets » (la session est vérifiée par la page). */
export async function EcranNouveautes() {
  if (!(await nouveautesAllume())) {
    return <EcranEteint code="nouveautes" dansOnglet />;
  }
  const { proposees, gardees } = await lesNouveautes();
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold">Nouveautés de la semaine</h2>
      <p className="text-texte-doux">Gardez celles dont vous voulez parler : elles entrent dans votre prochaine commande de vidéos. Une nouveauté périmée n&apos;est plus proposée.</p>
      <div className="flex flex-col gap-3">
        <h3 className="text-xl font-bold">À garder ou à écarter</h3>
        {proposees.length === 0 ? <p className="text-texte-doux">Rien à décider pour le moment.</p> : null}
        <ul className="flex flex-col gap-4">
          {proposees.map((n) => (
            <Fiche key={n.code} n={n} gardee={false} />
          ))}
        </ul>
      </div>
      {gardees.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-xl font-bold">Déjà gardées</h3>
          <ul className="flex flex-col gap-4">
            {gardees.map((n) => (
              <Fiche key={n.code} n={n} gardee />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
