import { FOND_TON, type TonPastille } from "./Pastille";

export interface Troncon {
  /** Au pluriel (« publiées ») ; au singulier pour 1, sans son « s » final. */
  libelle: string;
  valeur: number;
  ton: TonPastille;
}

/**
 * Une barre d'avancement en tronçons (dans l'ordre donné) et sa légende en chiffres.
 * La part vide est ce qui reste à faire. Les tronçons à zéro n'apparaissent pas.
 */
export function BarreAvancement({ troncons, total, legende = true }: { troncons: readonly Troncon[]; total: number; legende?: boolean }) {
  const visibles = troncons.filter((t) => t.valeur > 0);
  const fait = visibles.reduce((s, t) => s + t.valeur, 0);
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={visibles.map((t) => `${t.valeur} ${t.libelle}`).join(", ") || "Rien encore"}
        className="flex h-3 w-full overflow-hidden rounded-full bg-gris-doux"
      >
        {visibles.map((t) => (
          <span key={t.libelle} className={`h-full ${FOND_TON[t.ton]} border-r-2 border-surface last:border-r-0`} style={{ width: `${(100 * t.valeur) / Math.max(total, fait, 1)}%` }} />
        ))}
      </div>
      {legende ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {visibles.map((t) => (
            <li key={t.libelle} className="inline-flex items-center gap-1.5 text-texte-doux">
              <span aria-hidden className={`size-2.5 rounded-full ${FOND_TON[t.ton]}`} />
              <span className="font-bold text-texte tabular-nums">{t.valeur}</span> {t.valeur === 1 ? t.libelle.replace(/s$/, "") : t.libelle}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
