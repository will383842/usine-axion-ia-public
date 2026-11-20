"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const DELAI_ANNULER_MS = 10_000;
const REFUS_PAR_DEFAUT = "Cela n'a pas pu se faire. Réessayez dans un instant.";

interface Props {
  /** Libellé du bouton (« Archiver », « Éteindre »…). */
  libelle: string;
  /** Phrase affichée pendant les 10 s (« Métier éteint. »). */
  message: string;
  /**
   * Action serveur jouée au bout de 10 s, sauf si Will a touché « Annuler ». Si elle rend `{ ok: false, message }`, la
   * phrase s'affiche à la place de « fait » ; une erreur levée donne une phrase simple (jamais un échec silencieux).
   */
  action: () => Promise<void | { ok: boolean; message?: string }>;
  className?: string;
}

/**
 * « Annuler » 10 s plutôt qu'une confirmation : le geste s'affiche comme fait, l'action part au bout de 10 s.
 * Si Will quitte la page avant, l'action part tout de suite (elle n'est jamais perdue en silence).
 */
export function Annulable({ libelle, message, action, className = "bouton-second" }: Props) {
  const [reste, setReste] = useState<number | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const minuterie = useRef<ReturnType<typeof setInterval> | null>(null);
  const enAttente = useRef(false);
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const arreter = useCallback(() => {
    if (minuterie.current) clearInterval(minuterie.current);
    minuterie.current = null;
    setReste(null);
  }, []);

  const jouer = useCallback(() => {
    if (!enAttente.current) return;
    enAttente.current = false;
    arreter();
    actionRef
      .current()
      .then((r) => {
        if (r && r.ok === false) setRefus(r.message ?? REFUS_PAR_DEFAUT);
      })
      .catch(() => setRefus(REFUS_PAR_DEFAUT));
  }, [arreter]);

  const lancer = () => {
    setRefus(null);
    enAttente.current = true;
    const fin = Date.now() + DELAI_ANNULER_MS;
    setReste(Math.ceil(DELAI_ANNULER_MS / 1000));
    minuterie.current = setInterval(() => {
      const r = fin - Date.now();
      if (r <= 0) jouer();
      else setReste(Math.ceil(r / 1000));
    }, 250);
  };

  const annuler = () => {
    enAttente.current = false;
    arreter();
  };

  useEffect(() => {
    window.addEventListener("pagehide", jouer);
    return () => {
      window.removeEventListener("pagehide", jouer);
      jouer();
    };
  }, [jouer]);

  if (reste === null) {
    return (
      <>
        {refus && (
          <p role="alert" className="mb-2 rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
            {refus}
          </p>
        )}
        <button type="button" className={className} onClick={lancer}>
          {libelle}
        </button>
      </>
    );
  }
  return (
    <div role="status" className="flex min-h-11 flex-wrap items-center gap-3 rounded-xl bg-mocha px-4 py-2 text-sur-mocha">
      <span>{message}</span>
      <button type="button" onClick={annuler} className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-3 font-bold underline">
        Annuler ({reste} s)
      </button>
    </div>
  );
}
