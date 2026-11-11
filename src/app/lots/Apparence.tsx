import Link from "next/link";
import type { EtatLotLigne, Reseau } from "@/contrats";
import { Icone, Pastille, type NomIcone, type TonPastille } from "@/components/ui";
import { LIBELLE_ETAT } from "@/lots/regles";
import { LIBELLE_RESEAU } from "@/reglages/modele";

/** Chaque état d'une vidéo : sa couleur et sa forme. */
export const APPARENCE_ETAT: Record<EtatLotLigne, { ton: TonPastille; icone: NomIcone }> = {
  a_coller: { ton: "attente", icone: "coller" },
  collee: { ton: "en-cours", icone: "horloge" },
  fabriquee: { ton: "fait", icone: "video" },
  publiee: { ton: "publie", icone: "publie" },
  refusee: { ton: "refus", icone: "croix" },
};

export function PastilleEtat({ etat }: { etat: EtatLotLigne }) {
  const a = APPARENCE_ETAT[etat];
  return (
    <Pastille ton={a.ton} icone={a.icone}>
      {LIBELLE_ETAT[etat]}
    </Pastille>
  );
}

/** Les réseaux d'une vidéo en pictogrammes (leur nom pour le lecteur d'écran et au survol). */
export function Reseaux({ reseaux }: { reseaux: readonly Reseau[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Réseaux">
      {reseaux.map((r) => (
        <li key={r} title={LIBELLE_RESEAU[r]} className="inline-flex size-9 items-center justify-center rounded-xl bg-fond text-texte-doux">
          <Icone nom={r} taille={20} titre={LIBELLE_RESEAU[r]} />
        </li>
      ))}
    </ul>
  );
}

const TEMPS = ["Combien", "Aperçu", "Confirmer"] as const;

/** Les trois temps de la commande, le temps courant en terracotta, les temps passés cochés. */
export function TroisTemps({ actuel }: { actuel: 1 | 2 | 3 }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Étapes de la commande">
      {TEMPS.map((t, i) => {
        const n = i + 1;
        const etat = n < actuel ? "passe" : n === actuel ? "actuel" : "a-venir";
        return (
          <li key={t} aria-current={etat === "actuel" ? "step" : undefined} className="flex flex-col gap-1.5">
            <span
              className={`h-1.5 rounded-full ${etat === "a-venir" ? "bg-trait" : etat === "actuel" ? "bg-terracotta" : "bg-vert"}`}
              aria-hidden
            />
            <span className={`inline-flex items-center gap-1 font-semibold ${etat === "actuel" ? "text-terracotta-fonce" : "text-texte-doux"}`}>
              {etat === "passe" ? <Icone nom="coche" taille={16} /> : <span className="tabular-nums">{n}.</span>}
              {t}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Lien de retour vers « Mes vidéos ». */
export function RetourVideos() {
  return (
    <Link href="/lots" className="inline-flex min-h-11 items-center gap-2 self-start font-semibold text-texte-doux hover:text-texte">
      <Icone nom="retour" taille={20} />
      Mes vidéos
    </Link>
  );
}
