import type { Metadata } from "next";
import Link from "next/link";
import { depots, interrupteurAllume } from "@/donnees";
import { PHRASE_RESEAU_ECARTE, estReseauEcarte } from "@/planification/reseaux-ecartes";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { exigerSession } from "@/services/auth";
import { enregistrerLiensProfil } from "../actions";
import { Bloc, Entete, Retour } from "../Champs";
import { BoutonCompte } from "./BoutonCompte";
import { FormulaireCompte } from "./FormulaireCompte";
import { INTERRUPTEUR_COMPTES } from "./interrupteur";
import { avertissementDernierActif } from "./saisie";

export const metadata: Metadata = { title: "Mes comptes" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string; erreur?: string }>;
}) {
  await exigerSession();
  const { etat, erreur } = await searchParams;
  const [comptes, allumage] = await Promise.all([
    depots.compte.lister({ ordre: "code" }),
    interrupteurAllume(INTERRUPTEUR_COMPTES),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <form
        id="liens"
        action={enregistrerLiensProfil}
        className="flex flex-col gap-6"
      >
        <Entete
          titre="Mes comptes"
          intro="Le lien du profil de chaque compte. Une fin « Le lien est dans mon profil » n'est proposée que si ce lien est le bon. Laissez vide si vous n'en avez pas."
        />
        <Retour etat={etat} erreur={erreur} />
        {comptes.length === 0 ? (
          <p className="text-texte-doux">Aucun compte pour le moment.</p>
        ) : null}
        {comptes.map((c) => (
          <Bloc key={c.code} titre={c.nom ?? c.identifiant}>
            <label className="flex flex-col gap-1">
              <span className="text-texte-doux">
                {LIBELLE_RESEAU[c.reseau]}
              </span>
              <input
                name={`lien.${c.code}`}
                type="url"
                inputMode="url"
                className="champ"
                defaultValue={c.lien_profil ?? ""}
                placeholder="https://"
                maxLength={300}
                aria-label={`Lien du profil, ${c.nom ?? c.identifiant}`}
              />
            </label>
          </Bloc>
        ))}
        {comptes.length > 0 ? (
          <button type="submit" className="bouton self-start">
            Enregistrer
          </button>
        ) : null}
      </form>
      {comptes.length > 0 || allumage ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Comptes actifs</h2>
          {allumage ? (
            <>
              <p className="text-texte-doux">
                Un compte actif d&apos;Instagram, Facebook, TikTok ou LinkedIn peut
                recevoir des propositions de la semaine. Chacun est éteint tant que vous n&apos;y avez pas touché.
              </p>
              {comptes
                .filter((c) => c.etat !== "retire" && !c.archive_le)
                .map((c) => (
                  <div
                    key={c.code}
                    className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <h3 className="text-lg font-bold">
                        {c.nom ?? c.identifiant}
                      </h3>
                      <p className="text-texte-doux">
                        {LIBELLE_RESEAU[c.reseau]}
                      </p>
                      <p className="font-semibold">
                        {c.actif ? "Actif" : "Éteint"}
                      </p>
                      {estReseauEcarte(c.reseau) ? (
                        <p className="text-texte-doux">{PHRASE_RESEAU_ECARTE}</p>
                      ) : null}
                    </div>
                    <div>
                      <BoutonCompte code={c.code} actif={c.actif} nom={c.nom ?? c.identifiant} />
                    </div>
                    {avertissementDernierActif(comptes, c.code) ? (
                      <p role="note" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
                        {avertissementDernierActif(comptes, c.code)}
                      </p>
                    ) : null}
                  </div>
                ))}
              <FormulaireCompte />
            </>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
              <p>
                Allumer ou éteindre un compte n&apos;est pas encore allumé. Pour
                le permettre, allumez « Allumer ou éteindre un compte » dans les
                interrupteurs.
              </p>
              <Link
                href="/reglages/interrupteurs"
                className="bouton-second self-start"
              >
                Ouvrir les interrupteurs
              </Link>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
