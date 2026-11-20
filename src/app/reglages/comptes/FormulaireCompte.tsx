"use client";

import { useState } from "react";
import { Annulable } from "@/components/Annulable";
import { NATURES_COMPTE, RESEAUX } from "@/contrats";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { ajouterCompte } from "./actions";

const NATURE: Record<(typeof NATURES_COMPTE)[number], string> = { profil: "Profil", page: "Page", compte: "Compte" };

/** « Ajouter un compte » : l'ajout part au bout de 10 s, sauf « Annuler ». Le compte naît éteint. */
export function FormulaireCompte() {
  const [reseau, setReseau] = useState<string>("youtube");
  const [identifiant, setIdentifiant] = useState("");
  const [nom, setNom] = useState("");
  const [nature, setNature] = useState<string>("compte");
  const [retour, setRetour] = useState<{ texte: string; erreur: boolean } | null>(null);

  const envoyer = async () => {
    const r = await ajouterCompte({ reseau, identifiant, nom, nature });
    setRetour({ texte: r.message ?? (r.ok ? "Compte ajouté." : "Le compte n'a pas pu être ajouté."), erreur: !r.ok });
    if (r.ok) {
      setIdentifiant("");
      setNom("");
    }
    return r;
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-trait bg-surface p-4" aria-labelledby="titre-ajout-compte">
      <h3 id="titre-ajout-compte" className="text-lg font-bold">
        Ajouter un compte
      </h3>
      <label className="flex flex-col gap-1 font-semibold">
        Réseau
        <select className="champ" value={reseau} onChange={(e) => setReseau(e.target.value)}>
          {RESEAUX.map((r) => (
            <option key={r} value={r}>
              {LIBELLE_RESEAU[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Identifiant
        <input className="champ" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="off" spellCheck={false} maxLength={100} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Nom
        <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="off" maxLength={100} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Nature
        <select className="champ" value={nature} onChange={(e) => setNature(e.target.value)}>
          {NATURES_COMPTE.map((n) => (
            <option key={n} value={n}>
              {NATURE[n]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <Annulable libelle="Ajouter un compte" message="Compte ajouté." className="bouton" action={envoyer} />
      </div>
      {retour ? (
        <p role={retour.erreur ? "alert" : "status"} className={retour.erreur ? "rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce" : "text-texte-doux"}>
          {retour.texte}
        </p>
      ) : null}
    </section>
  );
}
