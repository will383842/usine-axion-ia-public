"use client";

import { useState } from "react";
import { Annulable } from "@/components/Annulable";
import { NATURES_COMPTE, RESEAUX } from "@/contrats";
import { estReseauEcarte } from "@/planification/reseaux-ecartes";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { ajouterCompte } from "./actions";
import { lireSaisieCompte, type ChampCompte } from "./saisie";

const NATURE: Record<(typeof NATURES_COMPTE)[number], string> = { profil: "Profil", page: "Page", compte: "Compte" };

const RESEAU_PAR_DEFAUT: string = RESEAUX.find((r) => !estReseauEcarte(r)) ?? RESEAUX[0];

/** « Ajouter un compte » : l'ajout part au bout de 10 s, sauf « Annuler ». Le compte naît éteint. */
export function FormulaireCompte() {
  const [reseau, setReseau] = useState<string>(RESEAU_PAR_DEFAUT);
  const [identifiant, setIdentifiant] = useState("");
  const [nom, setNom] = useState("");
  const [nature, setNature] = useState<string>("compte");
  const [retour, setRetour] = useState<string | null>(null);
  const [erreur, setErreur] = useState<{ champ: ChampCompte; message: string } | null>(null);

  /** Contrôle tout de suite, avant les 10 s : l'erreur s'affiche une fois, reliée à son champ. */
  const controler = () => {
    setRetour(null);
    const r = lireSaisieCompte({ reseau, identifiant, nom, nature });
    setErreur(r.ok ? null : { champ: r.champ, message: r.message });
    if (!r.ok) document.getElementById(`ajout-${r.champ}`)?.focus();
    return r.ok;
  };

  const envoyer = async () => {
    const r = await ajouterCompte({ reseau, identifiant, nom, nature });
    if (r.ok) {
      setRetour(r.message ?? "Compte ajouté.");
      setIdentifiant("");
      setNom("");
    }
    return r;
  };

  const lie = (champ: ChampCompte) => ({
    id: `ajout-${champ}`,
    "aria-invalid": erreur?.champ === champ ? (true as const) : undefined,
    "aria-describedby": erreur?.champ === champ ? "ajout-erreur" : undefined,
  });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-trait bg-surface p-4" aria-labelledby="titre-ajout-compte">
      <h3 id="titre-ajout-compte" className="text-lg font-bold">
        Ajouter un compte
      </h3>
      <label className="flex flex-col gap-1 font-semibold">
        Réseau
        <select className="champ" {...lie("reseau")} value={reseau} onChange={(e) => setReseau(e.target.value)}>
          {RESEAUX.map((r) => (
            <option key={r} value={r}>
              {LIBELLE_RESEAU[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Identifiant
        <input className="champ" {...lie("identifiant")} required aria-required="true" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="off" spellCheck={false} maxLength={100} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Nom
        <input className="champ" {...lie("nom")} required aria-required="true" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="off" maxLength={100} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Nature
        <select className="champ" {...lie("nature")} value={nature} onChange={(e) => setNature(e.target.value)}>
          {NATURES_COMPTE.map((n) => (
            <option key={n} value={n}>
              {NATURE[n]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <Annulable libelle="Ajouter un compte" message="Compte ajouté." className="bouton" action={envoyer} avant={controler} />
      </div>
      {erreur ? (
        <p id="ajout-erreur" role="alert" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
          {erreur.message}
        </p>
      ) : null}
      {retour ? (
        <p role="status" className="text-texte-doux">
          {retour}
        </p>
      ) : null}
    </section>
  );
}
