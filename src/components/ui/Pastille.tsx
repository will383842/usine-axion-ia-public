import { Icone, type NomIcone } from "./Icone";

export type TonPastille = "attente" | "en-cours" | "fait" | "publie" | "refus" | "neutre";

const COULEURS: Record<TonPastille, string> = {
  attente: "bg-terracotta-doux text-terracotta-fonce",
  "en-cours": "bg-ambre-doux text-ambre",
  fait: "bg-bleu-doux text-bleu",
  publie: "bg-vert-doux text-vert",
  refus: "bg-rouge-doux text-rouge",
  neutre: "bg-gris-doux text-texte-doux",
};

/** Un état en un coup d'œil : une couleur ET un pictogramme, avec son mot. */
export function Pastille({ ton, icone, children }: { ton: TonPastille; icone?: NomIcone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-base leading-none font-bold whitespace-nowrap ${COULEURS[ton]}`}>
      {icone ? <Icone nom={icone} taille={16} /> : null}
      {children}
    </span>
  );
}

/** Couleur de fond d'un ton, pour la barre d'avancement. */
export const FOND_TON: Record<TonPastille, string> = {
  attente: "bg-terracotta",
  "en-cours": "bg-ambre",
  fait: "bg-bleu",
  publie: "bg-vert",
  refus: "bg-rouge",
  neutre: "bg-trait",
};
