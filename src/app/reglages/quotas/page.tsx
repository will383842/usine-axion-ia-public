import type { Metadata } from "next";
import { RESEAUX } from "@/contrats";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { LIBELLE_PERIODE, LIBELLE_TYPE_QUOTA, PERIODES_QUOTA, QUANTITE_QUOTA_MAX, TYPES_QUOTA, lireQuotas } from "@/reglages";
import { exigerSession } from "@/services/auth";
import { enregistrerQuotas } from "../actions";
import { Bloc, Entete, Retour } from "../Champs";

export const metadata: Metadata = { title: "Quantités à produire" };
export const dynamic = "force-dynamic";

/** Brouillon simple : la maquette de cet écran n'est pas validée. Seul le réglage est posé ici. */
export default async function Page({ searchParams }: { searchParams: Promise<{ etat?: string; erreur?: string }> }) {
  await exigerSession();
  const { etat, erreur } = await searchParams;
  const quotas = await lireQuotas();
  return (
    <form action={enregistrerQuotas} className="flex flex-col gap-6">
      <Entete
        titre="Quantités à produire"
        intro="Combien de contenus, par jour ou par semaine, pour chaque réseau. Au-delà, la commande est mise de côté. Une commande faite par vous n'est jamais bloquée."
      />
      <Retour etat={etat} erreur={erreur} />
      {RESEAUX.map((r) => (
        <Bloc key={r} titre={LIBELLE_RESEAU[r]}>
          {TYPES_QUOTA.map((t) => (
            <div key={t} className="flex flex-col gap-1">
              <span className="font-semibold">{LIBELLE_TYPE_QUOTA[t]}</span>
              <div className="flex gap-2">
                <input
                  name={`${r}.${t}.quantite`}
                  type="number"
                  inputMode="numeric"
                  aria-label={`${LIBELLE_TYPE_QUOTA[t]}, ${LIBELLE_RESEAU[r]} : quantité`}
                  className="champ w-24"
                  defaultValue={quotas[r][t].quantite}
                  min={0}
                  max={QUANTITE_QUOTA_MAX}
                  step={1}
                  required
                />
                <select
                  name={`${r}.${t}.periode`}
                  aria-label={`${LIBELLE_TYPE_QUOTA[t]}, ${LIBELLE_RESEAU[r]} : jour ou semaine`}
                  className="champ"
                  defaultValue={quotas[r][t].periode}
                >
                  {PERIODES_QUOTA.map((p) => (
                    <option key={p} value={p}>
                      {LIBELLE_PERIODE[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </Bloc>
      ))}
      <button type="submit" className="bouton self-start">
        Enregistrer
      </button>
    </form>
  );
}
