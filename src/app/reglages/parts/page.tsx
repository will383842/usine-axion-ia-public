import type { Metadata } from "next";
import { RESEAUX } from "@/contrats";
import { FORMATS_EN_SERVICE, FORMATS_PART, LIBELLE_FORMAT, LIBELLE_RESEAU } from "@/reglages/modele";
import { lireReglagesTirage } from "@/reglages";
import { exigerSession } from "@/services/auth";
import { enregistrerParts } from "../actions";
import { Bloc, Entete, Nombre, Retour } from "../Champs";

export const metadata: Metadata = { title: "Parts par format" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ etat?: string; erreur?: string }> }) {
  await exigerSession();
  const { etat, erreur } = await searchParams;
  const { parts } = await lireReglagesTirage();
  return (
    <form action={enregistrerParts} className="flex flex-col gap-6">
      <Entete titre="Parts par format" intro="Pour chaque réseau, la part de chaque format. Les parts d'un réseau font toujours 100 %. Un format pas encore en service reste à 0." />
      <Retour etat={etat} erreur={erreur} />
      {RESEAUX.map((r) => (
        <Bloc key={r} titre={LIBELLE_RESEAU[r]}>
          {FORMATS_PART.map((f) =>
            FORMATS_EN_SERVICE.includes(f) ? (
              <Nombre key={f} nom={`${r}.${f}`} libelle={`${LIBELLE_FORMAT[f]} (%)`} defaut={parts[r][f]} max={100} />
            ) : (
              <div key={f} className="flex items-center justify-between gap-3">
                <span className="font-semibold">{LIBELLE_FORMAT[f]}</span>
                <span className="text-texte-doux">bientôt · 0 %</span>
                <input type="hidden" name={`${r}.${f}`} value="0" />
              </div>
            ),
          )}
        </Bloc>
      ))}
      <button type="submit" className="bouton self-start">
        Enregistrer
      </button>
    </form>
  );
}
