import type { Metadata } from "next";
import { depots } from "@/donnees";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { exigerSession } from "@/services/auth";
import { enregistrerLiensProfil } from "../actions";
import { Bloc, Entete, Retour } from "../Champs";

export const metadata: Metadata = { title: "Mes comptes" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ etat?: string; erreur?: string }> }) {
  await exigerSession();
  const { etat, erreur } = await searchParams;
  const comptes = await depots.compte.lister({ ordre: "code" });
  return (
    <form action={enregistrerLiensProfil} className="flex flex-col gap-6">
      <Entete titre="Mes comptes" intro="Le lien du profil de chaque compte. Une fin « Le lien est dans mon profil » n'est proposée que si ce lien est le bon. Laissez vide si vous n'en avez pas." />
      <Retour etat={etat} erreur={erreur} />
      {comptes.length === 0 ? <p className="text-texte-doux">Aucun compte pour le moment.</p> : null}
      {comptes.map((c) => (
        <Bloc key={c.code} titre={c.nom ?? c.identifiant}>
          <label className="flex flex-col gap-1">
            <span className="text-texte-doux">{LIBELLE_RESEAU[c.reseau]}</span>
            <input name={`lien.${c.code}`} type="url" inputMode="url" className="champ" defaultValue={c.lien_profil ?? ""} placeholder="https://" maxLength={300} aria-label={`Lien du profil, ${c.nom ?? c.identifiant}`} />
          </label>
        </Bloc>
      ))}
      {comptes.length > 0 ? (
        <button type="submit" className="bouton self-start">
          Enregistrer
        </button>
      ) : null}
    </form>
  );
}
