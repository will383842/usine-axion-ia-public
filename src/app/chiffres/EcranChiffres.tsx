import Link from "next/link";
import { aujourdhuiParis, ajouterJours, chiffresAllume, jourValide, lundiDe, vueDesChiffres } from "@/chiffres";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { Courbe } from "./Courbe";
import { FormulaireObjectif, FormulaireReleve } from "./Formulaires";

const jourLisible = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

/** Onglet « Demandes reçues » de « Mes mots et cadeaux » (la session est vérifiée par la page). */
export async function EcranChiffres({ semaine: demandee }: { semaine?: string }) {
  if (!(await chiffresAllume())) {
    return <EcranEteint code="chiffres" dansOnglet />;
  }
  const courante = lundiDe(await aujourdhuiParis());
  const lundi = demandee && jourValide(demandee) ? lundiDe(demandee) : courante;
  const { mots, comptesDesMots, comptes } = await vueDesChiffres(lundi);

  return (
    <section className="flex flex-col gap-8">
      <h2 className="text-2xl font-bold">Demandes reçues</h2>

      <div className="flex flex-col gap-3">
        <h3 className="text-xl font-bold">Semaine du {jourLisible(lundi)}</h3>
        <div className="flex flex-wrap gap-3">
          <Link href={`/mots?onglet=demandes&semaine=${ajouterJours(lundi, -7)}`} className="bouton-second">
            Semaine précédente
          </Link>
          {lundi !== courante ? (
            <Link href={`/mots?onglet=demandes&semaine=${ajouterJours(lundi, 7)}`} className="bouton-second">
              Semaine suivante
            </Link>
          ) : null}
        </div>
        <p className="text-texte-doux">Notez ce que vous avez relevé dans l&apos;outil d&apos;envoi. Un champ laissé vide vaut zéro ; vous pouvez corriger une semaine à tout moment.</p>
      </div>

      {mots.length === 0 ? <p className="text-texte-doux">Vous n&apos;avez pas encore de mot : voyez l&apos;onglet « Mots et messages ».</p> : null}
      {mots.map(({ mot, serie, rapport, saisis }) => (
        <div key={mot.code} className="flex flex-col gap-4">
          <h3 className="text-xl font-bold">Mot {mot.mot}</h3>
          {comptesDesMots.length === 0 ? <p className="text-texte-doux">Aucun compte Instagram ou Facebook n&apos;est encore enregistré.</p> : null}
          <div className="flex flex-col gap-3">
            {comptesDesMots.map((c) => {
              const s = saisis.find((x) => x.compte === c.code) ?? null;
              return <FormulaireReleve key={c.code} semaine={lundi} mot={mot.code} compte={c.code} nomCompte={`${c.nom ?? c.code} · ${LIBELLE_RESEAU[c.reseau]}`} valeurs={s} />;
            })}
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-trait bg-surface p-4">
            <h4 className="text-lg font-bold">Abonnés gagnés contre demandes de guide</h4>
            <p>
              Sur les 4 dernières semaines : {rapport.abonnesGagnes} abonnés gagnés, {rapport.demandesGuide} demandes de guide
              {rapport.abonnesParDemande !== null ? ` (${String(rapport.abonnesParDemande).replace(".", ",")} abonnés gagnés pour une demande).` : "."}
            </p>
            {serie.filter((p) => p.saisie).length >= 2 ? (
              <Courbe serie={serie} nom={mot.mot} />
            ) : (
              <p className="text-texte-doux">La courbe apparaît dès deux semaines saisies.</p>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-3">
        <h3 className="text-xl font-bold">Objectif de visibilité par compte</h3>
        <p className="text-texte-doux">Écrivez, avec vos mots, ce que vous visez pour chaque compte.</p>
        {comptes.length === 0 ? <p className="text-texte-doux">Aucun compte enregistré.</p> : null}
        {comptes.map((c) => (
          <FormulaireObjectif key={c.code} compte={c.code} nomCompte={`${c.nom ?? c.code} · ${LIBELLE_RESEAU[c.reseau]}`} objectif={c.objectif_visibilite} />
        ))}
      </div>
    </section>
  );
}
