"use client";

import { useState, type MouseEvent } from "react";
import { Annulable } from "@/components/Annulable";
import { REFUS_CODES, type RefusCode } from "@/contrats";
import { refuserAction, validerAction } from "./actions";

export interface DonneesCarte {
  cle: string;
  reseau: string;
  compte: string;
  quand: string;
  texte: string | null;
  premierCommentaire: string | null;
  empreinte: string;
  /** Lien vers la page du contenu dans le Studio, ou null s'il n'y a pas de média. */
  lienStudio: string | null;
  lienCalendrierStudio: string;
  etat: "a_valider" | "validee" | "sans_media" | "indisponible";
}

const MOTIFS: Record<RefusCode, string> = {
  hors_cible: "Hors cible",
  deja_vu: "Déjà vu",
  faux_ou_douteux: "Faux ou douteux",
  accroche_faible: "Accroche faible",
  voix_ou_rythme: "Voix ou rythme",
  image: "Image",
};

const lien = "inline-flex min-h-11 items-center underline";

/** Une carte « À valider » : le contenu fini du créneau, puis « Valider » (action principale) ou « Refuser » avec son motif. */
export function CarteAValider({ d }: { d: DonneesCarte }) {
  const [message, setMessage] = useState<string | null>(null);
  const [motif, setMotif] = useState<RefusCode>("hors_cible");
  const [note, setNote] = useState("");
  const [refus, setRefus] = useState(false);
  // Un seul geste à la fois : tant qu'un « Annuler » est offert, l'autre action est cachée (sans démonter l'Annulable en attente, qui jouerait son action au démontage).
  const [geste, setGeste] = useState<"valider" | "refuser" | null>(null);
  const suivre = (nom: "valider" | "refuser") => (e: MouseEvent<HTMLElement>) => {
    const bouton = (e.target as HTMLElement).closest("button");
    if (!bouton) return;
    setGeste((bouton.textContent ?? "").trim().startsWith("Annuler") ? null : nom);
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">
          {d.reseau} · {d.quand}
        </h2>
        <p className="text-texte-doux">Compte : {d.compte}</p>
      </header>

      {d.texte !== null ? <p className="whitespace-pre-wrap break-words">{d.texte}</p> : null}
      {d.premierCommentaire ? (
        <p className="whitespace-pre-wrap break-words text-texte-doux">
          <span className="font-bold">Premier commentaire : </span>
          {d.premierCommentaire}
        </p>
      ) : null}

      {d.lienStudio ? (
        <a className={lien} href={d.lienStudio} target="_blank" rel="noopener noreferrer">
          Voir dans le Studio
        </a>
      ) : null}

      {d.etat === "validee" ? <p className="font-bold">Validée.</p> : null}

      {d.etat === "sans_media" ? (
        <p>
          Rattachez la vidéo à cette date dans le Studio, puis revenez.{" "}
          <a className={lien} href={d.lienCalendrierStudio} target="_blank" rel="noopener noreferrer">
            Ouvrir le calendrier du Studio
          </a>
        </p>
      ) : null}

      {d.etat === "a_valider" ? (
        <div className="flex flex-col gap-3">
          <div hidden={geste === "refuser"} onClickCapture={suivre("valider")}>
            <Annulable
              libelle="Valider"
              message="Validé."
              className="bouton"
              action={async () => {
                setMessage((await validerAction(d.cle, d.empreinte)).message);
                setGeste(null);
              }}
            />
          </div>
          {refus ? (
            <div className="flex flex-col gap-2" hidden={geste === "valider"} onClickCapture={suivre("refuser")}>
              <label className="flex flex-col gap-1">
                Motif du refus
                <select className="min-h-11 rounded-lg border border-trait bg-surface px-3 text-base" value={motif} onChange={(e) => setMotif(e.target.value as RefusCode)}>
                  {REFUS_CODES.map((c) => (
                    <option key={c} value={c}>
                      {MOTIFS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                Un mot pour le Studio (facultatif)
                <input
                  className="min-h-11 rounded-lg border border-trait bg-surface px-3 text-base"
                  type="text"
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <Annulable
                libelle="Refuser"
                message="Refusé."
                action={async () => {
                  setMessage((await refuserAction(d.cle, d.empreinte, motif, note)).message);
                  setGeste(null);
                }}
              />
            </div>
          ) : (
            <button type="button" className="bouton-second self-start" hidden={geste === "valider"} onClick={() => setRefus(true)}>
              Refuser…
            </button>
          )}
        </div>
      ) : null}

      {message ? (
        <p role="status" className="text-texte-doux">
          {message}
        </p>
      ) : null}
    </article>
  );
}
