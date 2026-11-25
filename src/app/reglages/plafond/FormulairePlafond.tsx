"use client";

import { useState } from "react";
import { Annulable } from "@/components/Annulable";
import { allumerAutonomie, enregistrerPlafondAutomatique, eteindreAutonomie } from "./actions";

type Message = { texte: string; erreur: boolean };

/**
 * Interrupteur + plafond en euros, pré-remplis avec l'état lu dans le Studio. Rien ne part avant le geste d'enregistrement :
 * allumer = résumé, « Oui, allumer », puis 10 s pour annuler ; éteindre = tout de suite.
 */
export function FormulairePlafond({ allumeInitial, initial, resume }: { allumeInitial: boolean; initial: string; resume: string }) {
  const [allume, setAllume] = useState(allumeInitial);
  const [reel, setReel] = useState(allumeInitial);
  const [saisie, setSaisie] = useState(initial);
  const [enResume, setEnResume] = useState(false);
  const [verrou, setVerrou] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const montrer = (r: { ok: boolean; message: string }) => setMessage({ texte: r.message, erreur: !r.ok });
  const toucher = () => {
    setMessage(null);
    setEnResume(false);
  };

  const allumer = async () => {
    const r = await allumerAutonomie(saisie, "allumer");
    montrer(r);
    if (r.ok) {
      setReel(true);
      setEnResume(false);
    }
  };
  const eteindre = async () => {
    const r = await eteindreAutonomie();
    montrer(r);
    if (r.ok) setReel(false);
  };
  const plafondSeul = async () => {
    montrer(await enregistrerPlafondAutomatique(saisie));
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-trait bg-surface p-4">
      <label className="flex min-h-11 items-center justify-between gap-3 font-semibold">
        <span>Ce que l&apos;Usine dépense seule</span>
        <input
          type="checkbox"
          role="switch"
          className="h-8 w-14"
          checked={allume}
          disabled={verrou}
          onChange={(e) => {
            setAllume(e.target.checked);
            toucher();
          }}
        />
      </label>
      <p className="text-texte-doux">{allume ? "Allumé : l'Usine peut acheter seule, dans la limite du plafond." : "Éteint : chaque dépense de l'Usine vous demande votre accord."}</p>
      <label className="flex flex-col gap-2 font-semibold">
        Plafond du mois, en euros
        <input
          className="champ"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={saisie}
          disabled={verrou}
          onChange={(e) => {
            setSaisie(e.target.value);
            toucher();
          }}
        />
      </label>
      {message && (
        <p role={message.erreur ? "alert" : "status"} className={message.erreur ? "rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce" : "font-semibold"}>
          {message.texte}
        </p>
      )}
      {allume && enResume && (
        <div className="flex flex-col gap-3 rounded-lg border border-trait p-3">
          <p className="font-semibold">Avant d&apos;allumer</p>
          <p>{resume.replace("{plafond}", saisie)}</p>
          <p>Après « Oui, allumer », vous aurez encore 10 secondes pour annuler.</p>
          <Annulable libelle="Oui, allumer" message="Allumage envoyé au Studio dans 10 s." action={allumer} className="bouton" surDecompte={setVerrou} annulerSiQuitte />
          <button type="button" className="inline-flex min-h-11 items-center font-semibold underline" disabled={verrou} onClick={() => setEnResume(false)}>
            Revenir
          </button>
        </div>
      )}
      {allume && !enResume && (
        <button type="button" className="bouton" onClick={() => setEnResume(true)}>
          {reel ? "Enregistrer le nouveau plafond" : "Continuer"}
        </button>
      )}
      {!allume && reel && (
        <button type="button" className="bouton" onClick={eteindre}>
          Éteindre maintenant
        </button>
      )}
      {!allume && !reel && <Annulable libelle="Enregistrer le plafond" message="Plafond envoyé au Studio dans 10 s." action={plafondSeul} className="bouton" surDecompte={setVerrou} />}
    </section>
  );
}
