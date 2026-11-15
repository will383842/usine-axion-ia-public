"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { appliquerTheme, lireTheme } from "@/lib/theme";
import { BarreLaterale, Menu } from "./BarreLaterale";
import { RechercheCtrlK } from "./RechercheCtrlK";
import { NAVIGATION_BASSE, SANS_GABARIT, estActif } from "./navigation";

/**
 * Gabarit de tous les écrans : barre latérale bleu ciel à partir de 1024 px, sinon en-tête et navigation basse avec « Plus ».
 * Lisible à 375 px de large, texte de 16 px au moins, cibles de 44 px au moins.
 */
export function Gabarit({ children, eteints = [] }: { children: React.ReactNode; eteints?: string[] }) {
  const pathname = usePathname();
  const [plusOuvert, setPlusOuvert] = useState(false);
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [pathnameVu, setPathnameVu] = useState(pathname);
  if (pathnameVu !== pathname) {
    setPathnameVu(pathname);
    setPlusOuvert(false);
  }
  useEffect(() => {
    try {
      appliquerTheme(lireTheme(localStorage), document.documentElement);
    } catch {
      /* stockage fermé : thème clair */
    }
  }, []);
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
      <BarreLaterale pathname={pathname} eteints={lesEteints} surRecherche={() => setRechercheOuverte(true)} />
      <RechercheCtrlK ouvert={rechercheOuverte} surChangement={setRechercheOuverte} />
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
        <div role="dialog" aria-modal="true" aria-label="Menu complet" data-barre="" className="fixed inset-0 z-20 flex flex-col bg-barre text-barre-texte p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-titre text-lg font-bold">Menu</p>
            <button type="button" onClick={() => setPlusOuvert(false)} className="bouton-second">
              Fermer
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Menu pathname={pathname} eteints={lesEteints} surClic={() => setPlusOuvert(false)} surRecherche={() => setRechercheOuverte(true)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
