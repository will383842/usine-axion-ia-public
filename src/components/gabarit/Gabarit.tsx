"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { deconnexion } from "@/app/connexion/actions";
import { MENU, NAVIGATION_BASSE, REGLAGES, SANS_GABARIT, URL_STUDIO, estActif } from "./navigation";

const LIEN_MENU =
  "flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 font-semibold text-texte-doux hover:text-texte aria-[current=page]:bg-terracotta-doux aria-[current=page]:text-terracotta-fonce";
const LIGNE_MENU =
  "flex min-h-11 flex-col justify-center gap-0.5 rounded-lg px-3 py-2 text-texte hover:bg-fond aria-[current=page]:bg-terracotta-doux aria-[current=page]:text-terracotta-fonce";

function Menu({ pathname, eteints, surClic }: { pathname: string; eteints: ReadonlySet<string>; surClic?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <nav aria-label="Menu" className="flex flex-1 flex-col overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {MENU.map((e) => (
            <li key={e.href}>
              <Link href={e.href} onClick={surClic} aria-current={estActif(e.href, pathname) ? "page" : undefined} className={LIGNE_MENU}>
                <span className="flex items-center justify-between gap-2 font-bold">
                  {e.libelle}
                  {e.codes && e.codes.every((c) => eteints.has(c)) ? (
                    <span className="rounded-full border border-trait px-2 text-base font-semibold text-texte-doux">éteint</span>
                  ) : null}
                </span>
                <span className="text-base leading-snug text-texte-doux">{e.phrase}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-1 border-t border-trait pt-3">
        <Link href={REGLAGES.href} onClick={surClic} aria-current={estActif(REGLAGES.href, pathname) ? "page" : undefined} className={LIEN_MENU}>
          {REGLAGES.libelle}
        </Link>
        <a href={URL_STUDIO} target="_blank" rel="noopener noreferrer" className={LIEN_MENU}>
          Ouvrir le studio
        </a>
        <form action={deconnexion}>
          <button type="submit" className={`${LIEN_MENU} w-full text-left`}>
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Gabarit de tous les écrans : menu latéral à partir de 1024 px, sinon en-tête et navigation basse avec « Plus ».
 * Lisible à 375 px de large, texte de 16 px au moins, cibles de 44 px au moins.
 */
export function Gabarit({ children, eteints = [] }: { children: React.ReactNode; eteints?: string[] }) {
  const pathname = usePathname();
  const [plusOuvert, setPlusOuvert] = useState(false);
  const [pathnameVu, setPathnameVu] = useState(pathname);
  if (pathnameVu !== pathname) {
    setPathnameVu(pathname);
    setPlusOuvert(false);
  }
  useEffect(() => {
    if (!plusOuvert) return;
    const surTouche = (e: KeyboardEvent) => e.key === "Escape" && setPlusOuvert(false);
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [plusOuvert]);

  if (SANS_GABARIT.includes(pathname)) return <>{children}</>;
  const lesEteints = new Set(eteints);
  const plusActif = !NAVIGATION_BASSE.some((e) => estActif(e.href, pathname));
  return (
    <div className="flex min-h-dvh flex-col lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-72 flex-col gap-4 border-r border-trait bg-surface p-4 lg:flex">
        <Link href="/" className="inline-flex min-h-11 items-center self-start rounded-full bg-terracotta px-4 font-titre text-lg font-bold text-sur-terracotta">
          Usine Axion
        </Link>
        <div className="min-h-0 flex-1">
          <Menu pathname={pathname} eteints={lesEteints} />
        </div>
      </aside>
      <header className="sticky top-0 z-10 border-b border-trait bg-fond/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-terracotta px-4 font-titre text-lg font-bold text-sur-terracotta">
            Usine Axion
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-[calc(var(--hauteur-nav)+2rem)] lg:pb-10">{children}</main>
      <nav aria-label="Navigation" className="fixed inset-x-0 bottom-0 z-10 border-t border-trait bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid h-[var(--hauteur-nav)] grid-cols-4">
          {NAVIGATION_BASSE.map((e) => (
            <li key={e.href} className="flex">
              <Link
                href={e.href}
                aria-current={estActif(e.href, pathname) ? "page" : undefined}
                className="flex flex-1 items-center justify-center px-0.5 text-center text-base leading-tight font-semibold tracking-tight text-texte-doux aria-[current=page]:border-t-4 aria-[current=page]:border-terracotta aria-[current=page]:text-terracotta-fonce"
              >
                {e.libelle}
              </Link>
            </li>
          ))}
          <li className="flex">
            <button
              type="button"
              onClick={() => setPlusOuvert(true)}
              aria-haspopup="dialog"
              aria-expanded={plusOuvert}
              data-actif={plusActif ? "oui" : undefined}
              className="flex flex-1 items-center justify-center px-0.5 text-center text-base leading-tight font-semibold tracking-tight text-texte-doux data-[actif=oui]:border-t-4 data-[actif=oui]:border-terracotta data-[actif=oui]:text-terracotta-fonce"
            >
              Plus
            </button>
          </li>
        </ul>
      </nav>
      {plusOuvert ? (
        <div role="dialog" aria-modal="true" aria-label="Menu complet" className="fixed inset-0 z-20 flex flex-col bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-titre text-lg font-bold">Menu</p>
            <button type="button" onClick={() => setPlusOuvert(false)} className="bouton-second">
              Fermer
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Menu pathname={pathname} eteints={lesEteints} surClic={() => setPlusOuvert(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
