"use client";

import Link from "next/link";
import { deconnexion } from "@/app/connexion/actions";
import { Icone } from "@/components/ui/Icone";
import { CLE_THEME, ecrireTheme, themeValide } from "@/lib/theme";
import { MENU, REGLAGES, URL_STUDIO, estActif } from "./navigation";

const LIEN_BAS =
  "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left font-semibold text-barre-texte hover:bg-barre-survol aria-[current=page]:bg-barre-actif";

/** Bascule clair/sombre : le mot affiché suit l'attribut `data-theme` de la page (voir globals.css), sans état à part. */
function BoutonTheme() {
  const basculer = () => {
    const racine = document.documentElement;
    const suivant = themeValide(racine.getAttribute("data-theme")) === "sombre" ? "clair" : "sombre";
    racine.setAttribute("data-theme", suivant);
    ecrireTheme(suivant, localStorage);
  };
  return (
    <button type="button" onClick={basculer} className={LIEN_BAS} data-cle={CLE_THEME}>
      <Icone nom="soleil" taille={20} />
      <span className="si-clair">Passer au thème sombre</span>
      <span className="si-sombre">Passer au thème clair</span>
    </button>
  );
}

/** Le contenu de la barre : recherche, six lignes, puis Réglages, thème, studio, déconnexion. */
export function Menu({ pathname, eteints, surClic, surRecherche }: { pathname: string; eteints: ReadonlySet<string>; surClic?: () => void; surRecherche: () => void }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          surClic?.();
          surRecherche();
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-barre-actif px-3 text-left font-semibold text-barre-texte"
      >
        <span>Chercher une page</span>
        <kbd className="rounded-md border border-barre-texte/30 px-1.5 text-base font-semibold">Ctrl K</kbd>
      </button>
      <nav aria-label="Menu" className="flex flex-1 flex-col overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {MENU.map((e) => (
            <li key={e.href}>
              <Link
                href={e.href}
                onClick={surClic}
                aria-current={estActif(e.href, pathname) ? "page" : undefined}
                className="flex min-h-11 flex-col justify-center gap-0.5 rounded-xl px-3 py-2 text-barre-texte hover:bg-barre-survol aria-[current=page]:bg-barre-actif aria-[current=page]:shadow-sm"
              >
                <span className="flex items-center justify-between gap-2 font-bold">
                  {e.libelle}
                  {e.codes && e.codes.every((c) => eteints.has(c)) ? (
                    <span className="rounded-full border border-barre-texte/40 px-2 text-base font-semibold">éteint</span>
                  ) : null}
                </span>
                <span className="text-base leading-snug text-barre-texte/80">{e.phrase}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-1 border-t border-barre-texte/20 pt-3">
        <Link href={REGLAGES.href} onClick={surClic} aria-current={estActif(REGLAGES.href, pathname) ? "page" : undefined} className={LIEN_BAS}>
          {REGLAGES.libelle}
        </Link>
        <BoutonTheme />
        <a href={URL_STUDIO} target="_blank" rel="noopener noreferrer" className={LIEN_BAS}>
          Ouvrir le studio
        </a>
        <form action={deconnexion}>
          <button type="submit" className={LIEN_BAS}>
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

/** Barre latérale bleu ciel, fixe à partir de 1024 px (au téléphone, le même contenu s'ouvre par « Plus »). */
export function BarreLaterale(props: { pathname: string; eteints: ReadonlySet<string>; surRecherche: () => void }) {
  return (
    <aside data-barre="" className="fixed inset-y-0 left-0 z-10 hidden w-72 flex-col gap-4 bg-barre p-4 text-barre-texte lg:flex">
      <Link href="/" className="inline-flex min-h-11 items-center self-start rounded-full bg-barre-texte px-4 font-titre text-lg font-bold text-barre">
        Usine Axion
      </Link>
      <div className="min-h-0 flex-1">
        <Menu {...props} />
      </div>
    </aside>
  );
}
