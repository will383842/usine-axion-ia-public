import type { Metadata } from "next";
import { CODES_SERVICE, CODES_TAILLE } from "@/contrats";
import { LIBELLE_SERVICE } from "@/reglages/modele";
import { lireReglagesTirage } from "@/reglages";
import { exigerSession } from "@/services/auth";
import { enregistrerTirage } from "../actions";
import { Bloc, Entete, Nombre, Retour } from "../Champs";

export const metadata: Metadata = { title: "Poids et plafond" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ etat?: string; erreur?: string }> }) {
  await exigerSession();
  const { etat, erreur } = await searchParams;
  const r = await lireReglagesTirage();
  return (
    <form action={enregistrerTirage} className="flex flex-col gap-6">
      <Entete titre="Poids et plafond" intro="Plus un poids est grand, plus la taille d'entreprise ou le service revient souvent. Le plafond est proposé à chaque commande de vidéos." />
      <Retour etat={etat} erreur={erreur} />
      <Bloc titre="Poids par taille d'entreprise">
        {CODES_TAILLE.map((c) => (
          <Nombre key={c} nom={`taille.${c}`} libelle={c} defaut={r.poidsTaille[c]} max={100} />
        ))}
      </Bloc>
      <Bloc titre="Poids par service">
        {CODES_SERVICE.map((c) => (
          <Nombre key={c} nom={`service.${c}`} libelle={LIBELLE_SERVICE[c]} defaut={r.poidsService[c]} max={100} />
        ))}
      </Bloc>
      <Bloc titre="Plafond par commande">
        <Nombre nom="plafond" libelle="Plafond par défaut (€)" defaut={r.plafondLotEur} min={1} pas={0.5} />
      </Bloc>
      <button type="submit" className="bouton self-start">
        Enregistrer
      </button>
    </form>
  );
}
