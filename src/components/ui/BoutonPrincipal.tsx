import Link from "next/link";
import type { ReactNode } from "react";
import { Icone, type NomIcone } from "./Icone";

/** L'action principale de l'écran (une seule) : terracotta, large, 48 px de haut au moins, pleine largeur au téléphone. */
export const CLASSE_PRINCIPAL =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-terracotta px-6 py-3 text-lg font-bold text-sur-terracotta shadow-carte hover:bg-terracotta-fonce disabled:opacity-60 sm:w-auto";

/** Une action discrète : bordure fine, 44 px de haut au moins. */
export const CLASSE_DISCRET =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-trait bg-surface px-4 py-2 font-semibold text-texte hover:border-texte-doux";

type Commun = { children: ReactNode; icone?: NomIcone };

export function BoutonPrincipal(props: Commun & ({ href: string; externe?: boolean } | { type?: "submit" | "button"; href?: undefined })) {
  const contenu = (
    <>
      {props.icone ? <Icone nom={props.icone} /> : null}
      {props.children}
    </>
  );
  if (props.href !== undefined) {
    return props.externe ? (
      <a href={props.href} target="_blank" rel="noopener noreferrer" className={CLASSE_PRINCIPAL}>
        {contenu}
      </a>
    ) : (
      <Link href={props.href} className={CLASSE_PRINCIPAL}>
        {contenu}
      </Link>
    );
  }
  return (
    <button type={props.type ?? "submit"} className={CLASSE_PRINCIPAL}>
      {contenu}
    </button>
  );
}

/** Le même bouton en discret (lien ou bouton de formulaire). */
export function BoutonDiscret(props: Commun & ({ href: string; externe?: boolean } | { type?: "submit" | "button"; href?: undefined })) {
  const contenu = (
    <>
      {props.icone ? <Icone nom={props.icone} taille={20} /> : null}
      {props.children}
    </>
  );
  if (props.href !== undefined) {
    return props.externe ? (
      <a href={props.href} target="_blank" rel="noopener noreferrer" className={CLASSE_DISCRET}>
        {contenu}
      </a>
    ) : (
      <Link href={props.href} className={CLASSE_DISCRET}>
        {contenu}
      </Link>
    );
  }
  return (
    <button type={props.type ?? "submit"} className={CLASSE_DISCRET}>
      {contenu}
    </button>
  );
}
