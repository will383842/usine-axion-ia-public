"use client";

import { useState } from "react";
import { Annulable } from "@/components/Annulable";
import type { Reseau } from "@/contrats";
import { ajouter } from "./actions";

type Canal = "tous" | "instagram" | "facebook" | "email";
type Source = "will" | "zernio-stop" | "site";

const CANAUX: { valeur: Canal; libelle: string }[] = [
  { valeur: "tous", libelle: "Tous les canaux" },
  { valeur: "email", libelle: "E-mail" },
  { valeur: "instagram", libelle: "Instagram" },
  { valeur: "facebook", libelle: "Facebook" },
];
const SOURCES: { valeur: Source; libelle: string }[] = [
  { valeur: "will", libelle: "Vous" },
  { valeur: "zernio-stop", libelle: "STOP reçu par l'outil d'envoi" },
  { valeur: "site", libelle: "Le site" },
];
const NOMS_RESEAUX: Record<Reseau, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  "youtube-shorts": "YouTube Shorts",
};

/** Ajout à la main : l'ajout part au bout de 10 s, sauf « Annuler ». */
export function FormulaireOpposition({ reseaux }: { reseaux: readonly Reseau[] }) {
  const [saisie, setSaisie] = useState("");
  const [reseau, setReseau] = useState<Reseau>("instagram");
  const [canal, setCanal] = useState<Canal>("tous");
  const [source, setSource] = useState<Source>("will");
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const estAdresse = saisie.includes("@") && !saisie.trim().startsWith("@");

  const envoyer = async () => {
    const r = await ajouter({ saisie, reseau: estAdresse ? undefined : reseau, canal, source });
    if (!r.ok) return setMessage({ texte: r.message, erreur: true });
    setSaisie("");
    setMessage({ texte: r.deja ? "Cette personne était déjà opposée sur ce canal." : "Opposition enregistrée.", erreur: false });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-trait bg-surface p-4">
      <h2 className="text-xl font-bold">Ajouter une opposition</h2>
      <label className="flex flex-col gap-2 font-semibold">
        Adresse e-mail ou compte de la personne
        <input
          className="champ"
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setMessage(null);
          }}
          placeholder="nom@example.com ou @compte"
        />
      </label>
      {!estAdresse && (
        <label className="flex flex-col gap-2 font-semibold">
          Réseau du compte
          <select className="champ" value={reseau} onChange={(e) => setReseau(e.target.value as Reseau)}>
            {reseaux.map((r) => (
              <option key={r} value={r}>
                {NOMS_RESEAUX[r]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-2 font-semibold">
        Ne plus rien recevoir sur
        <select className="champ" value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
          {CANAUX.map((c) => (
            <option key={c.valeur} value={c.valeur}>
              {c.libelle}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 font-semibold">
        Demandée par
        <select className="champ" value={source} onChange={(e) => setSource(e.target.value as Source)}>
          {SOURCES.map((s) => (
            <option key={s.valeur} value={s.valeur}>
              {s.libelle}
            </option>
          ))}
        </select>
      </label>
      {message && (
        <p role={message.erreur ? "alert" : "status"} className={message.erreur ? "rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce" : "font-semibold"}>
          {message.texte}
        </p>
      )}
      {saisie.trim() ? (
        <Annulable libelle="Ajouter l'opposition" message="Opposition ajoutée." action={envoyer} className="bouton" />
      ) : (
        <button type="button" className="bouton" disabled>
          Ajouter l&apos;opposition
        </button>
      )}
    </section>
  );
}
