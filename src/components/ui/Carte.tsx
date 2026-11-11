import type { ReactNode } from "react";

/** Un bloc : coins arrondis, ombre légère, beaucoup d'air. Une idée par carte. */
export const CLASSE_CARTE = "flex flex-col gap-3 rounded-3xl border border-trait bg-surface p-5 shadow-carte";

export function Carte({ children, className = "", as: Balise = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" | "section" | "article" }) {
  return <Balise className={`${CLASSE_CARTE} ${className}`}>{children}</Balise>;
}

/** Le rond coloré qui porte le pictogramme d'une carte. */
export function Medaillon({ children, ton = "terracotta" }: { children: ReactNode; ton?: "terracotta" | "vert" | "bleu" | "ambre" | "gris" }) {
  const couleurs = {
    terracotta: "bg-terracotta-doux text-terracotta-fonce",
    vert: "bg-vert-doux text-vert",
    bleu: "bg-bleu-doux text-bleu",
    ambre: "bg-ambre-doux text-ambre",
    gris: "bg-gris-doux text-texte-doux",
  }[ton];
  return <span className={`inline-flex size-12 shrink-0 items-center justify-center rounded-2xl ${couleurs}`}>{children}</span>;
}
