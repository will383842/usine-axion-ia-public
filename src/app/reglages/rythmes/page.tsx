import type { Metadata } from "next";
import { RESEAUX } from "@/contrats";
import { LIBELLE_RESEAU, RYTHME_MAX_PAR_SEMAINE } from "@/reglages/modele";
import { lireReglagesTirage } from "@/reglages";
import { exigerSession } from "@/services/auth";
import { enregistrerRythmes } from "../actions";
import { Bloc, Entete, Nombre, Retour } from "../Champs";

export const metadata: Metadata = { title: "Rythmes de publication" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ etat?: string; erreur?: string }> }) {
  await exigerSession();
  const { etat, erreur } = await searchParams;
  const { rythmes, actualitesParSemaine } = await lireReglagesTirage();
  return (
    <form action={enregistrerRythmes} className="flex flex-col gap-6">
      <Entete titre="Rythmes de publication" intro="Combien de publications par semaine, par réseau (de 0 à 30). Les nouveautés entrent dans vos commandes à leur propre rythme." />
      <Retour etat={etat} erreur={erreur} />
      {RESEAUX.map((r) => (
        <Bloc key={r} titre={LIBELLE_RESEAU[r]}>
          <Nombre nom={`${r}.min`} libelle="Au moins, par semaine" defaut={rythmes[r].min} max={RYTHME_MAX_PAR_SEMAINE} />
          <Nombre nom={`${r}.max`} libelle="Au plus, par semaine" defaut={rythmes[r].max} max={RYTHME_MAX_PAR_SEMAINE} />
        </Bloc>
      ))}
      <Bloc titre="Actualités">
        <Nombre nom="actualites" libelle="Actualités par semaine, au plus" defaut={actualitesParSemaine} max={7} />
      </Bloc>
      <button type="submit" className="bouton self-start">
        Enregistrer
      </button>
    </form>
  );
}
