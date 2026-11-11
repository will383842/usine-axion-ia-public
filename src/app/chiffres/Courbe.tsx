import { pointsDeCourbe, type PointSemaine } from "@/chiffres/regles";

const L = 300;
const H = 120;

const jourCourt = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/** Courbe d'un mot : demandes de guide (trait plein) et abonnés gagnés (pointillés), semaine par semaine, même échelle. */
export function Courbe({ serie, nom }: { serie: PointSemaine[]; nom: string }) {
  const haut = Math.max(...serie.flatMap((p) => [p.demandes_guide, p.abonnes_gagnes]));
  const trace = (valeurs: number[]) => pointsDeCourbe(valeurs, haut, L, H).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const resume = serie.map((p) => `${jourCourt(p.semaine)} : ${p.demandes_guide} demandes de guide, ${p.abonnes_gagnes} abonnés gagnés`).join(" ; ");
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`-4 -8 ${L + 8} ${H + 16}`} role="img" aria-label={`Courbe du mot ${nom} : ${resume}`} className="h-auto w-full max-w-full overflow-visible">
        <line x1="0" y1={H} x2={L} y2={H} stroke="var(--trait)" strokeWidth="1" />
        <polyline points={trace(serie.map((p) => p.demandes_guide))} fill="none" stroke="var(--terracotta)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={trace(serie.map((p) => p.abonnes_gagnes))} fill="none" stroke="var(--mocha)" strokeWidth="3" strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 text-texte-doux">
        <span>━ Demandes de guide</span>
        <span>┅ Abonnés gagnés</span>
        <span>
          {jourCourt(serie[0].semaine)} → {jourCourt(serie[serie.length - 1].semaine)}
        </span>
      </figcaption>
    </figure>
  );
}
