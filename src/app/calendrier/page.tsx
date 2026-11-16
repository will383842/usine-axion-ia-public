import type { Metadata } from "next";
import Link from "next/link";
import { ajouterJours, calendrierAllume, lignesDuCalendrier, lundiDe, rappelDesParts, trousAVenir } from "@/calendrier";
import { EnTete, EtatVide } from "@/components/gabarit/EnTete";
import { commandesAllumees, listerCommandes, palierDeLigne } from "@/commandes/service";
import { LIBELLE_ETAT_STUDIO } from "@/commandes/regles";
import { requete } from "@/lib/base";
import { LIBELLE_FORMAT, LIBELLE_RESEAU } from "@/reglages/modele";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { exigerSession } from "@/services/auth";
import { ChangerJour } from "./ChangerJour";
import { PlacerNouveaux } from "./PlacerNouveaux";
import { MettreAJourDepuisStudio, ProposerAuStudio } from "./ProposerAuStudio";

export const metadata: Metadata = { title: "Mon calendrier" };
export const dynamic = "force-dynamic";

const NOM_TYPE: Record<string, string> = { video: "Vidéo", carrousel: "Carrousel", image: "Texte avec image", texte: "Texte seul", story: "Story" };
const HORIZON_JOURS = 27;

const jourLisible = (jour: string) => new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function Page() {
  await exigerSession();
  if (!(await calendrierAllume())) {
    return <EcranEteint code="calendrier" />;
  }
  const [{ j: aujourd }] = await requete<{ j: string }>(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS j`);
  const [lignes, trous, parts] = await Promise.all([lignesDuCalendrier(aujourd, ajouterJours(aujourd, HORIZON_JOURS)), trousAVenir(aujourd), rappelDesParts(aujourd)]);
  const jours = [...new Set(lignes.map((l) => l.jour))];
  const echangesAllumes = await commandesAllumees();
  const commandes = echangesAllumes ? await listerCommandes() : new Map();
  const paliers = new Map<string, string>();
  if (echangesAllumes) {
    for (const l of lignes) {
      const p = await palierDeLigne(l.reseau, l.type_contenu, l.jour);
      if (p && p.palier > 0) paliers.set(l.id, `${p.palier} % du quota`);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <EnTete titre="Mon calendrier" phrase="Ce qui sort, quel jour, sur quel réseau : vos vidéos commandées, réparties selon vos rythmes. Changez le jour d'une vidéo si besoin." />

      <PlacerNouveaux />
      {echangesAllumes && commandes.size > 0 ? <MettreAJourDepuisStudio /> : null}

      {trous.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-terracotta bg-surface p-3">
          <h2 className="text-lg font-bold">Trous à combler</h2>
          <ul className="flex flex-col gap-1">
            {trous.map((t) => (
              <li key={`${t.reseau}-${t.lundi}`}>
                {LIBELLE_RESEAU[t.reseau]} · {t.lundi === lundiDe(aujourd) ? "cette semaine" : "semaine prochaine"} : il manque {t.manque}{" "}
                {t.manque === 1 ? "publication" : "publications"} ({t.prevues} prévue{t.prevues > 1 ? "s" : ""}).
              </li>
            ))}
          </ul>
          <Link href="/lots/nouveau" className="bouton self-start">
            Commander des vidéos
          </Link>
        </div>
      ) : null}

      {jours.length === 0 ? (
        <EtatVide message="Rien de prévu pour les quatre prochaines semaines. Les vidéos que vous commandez apparaîtront ici." bouton={{ href: "/lots", libelle: "Commander des vidéos" }} />
      ) : (
        <ul className="flex flex-col gap-4">
          {jours.map((jour) => (
            <li key={jour} className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
              <h2 className="text-xl font-bold first-letter:uppercase">{jourLisible(jour)}</h2>
              <ul className="flex flex-col gap-4">
                {lignes
                  .filter((l) => l.jour === jour)
                  .map((l) => (
                    <li key={l.id} className="flex flex-col gap-2">
                      <p className="font-semibold">
                        {LIBELLE_RESEAU[l.reseau]} · {NOM_TYPE[l.type_contenu] ?? l.type_contenu}
                      </p>
                      <p className="text-texte-doux">
                        {l.metier ?? "Sans métier"}
                      </p>
                      <ChangerJour id={l.id} jour={l.jour} />
                      {echangesAllumes ? (
                        <div className="flex flex-col gap-1">
                          {commandes.get(l.id) ? (
                            <p>
                              {commandes.get(l.id).etat_studio
                                ? LIBELLE_ETAT_STUDIO[commandes.get(l.id).etat_studio as keyof typeof LIBELLE_ETAT_STUDIO]
                                : `Pas encore envoyée : ${commandes.get(l.id).message ?? "réessayez."}`}
                            </p>
                          ) : null}
                          {commandes.get(l.id)?.message && commandes.get(l.id).etat_studio ? <p className="text-texte-doux">{commandes.get(l.id).message}</p> : null}
                          {paliers.get(l.id) ? <p className="text-texte-doux">{paliers.get(l.id)}</p> : null}
                          {!commandes.get(l.id) || commandes.get(l.id).etat_envoi === "non_envoyee" ? <ProposerAuStudio id={l.id} /> : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Les parts par format</h2>
        <p className="text-texte-doux">Part voulue dans Réglages, contre ce qui est prévu ou publié sur les 30 derniers jours.</p>
        {parts.length === 0 ? <p className="text-texte-doux">Pas encore de contenu sur les 30 derniers jours.</p> : null}
        <ul className="flex flex-col gap-3">
          {parts.map((p) => (
            <li key={p.reseau} className="flex flex-col gap-1 rounded-2xl border border-trait bg-surface p-4">
              <h3 className="text-lg font-bold">{LIBELLE_RESEAU[p.reseau]}</h3>
              {p.ecarts.map((e) => (
                <p key={e.format}>
                  {LIBELLE_FORMAT[e.format]} : voulu {e.voulue} %, constaté {e.constatee} %
                  {e.ecart === 0 ? " (conforme)" : ` (${e.ecart > 0 ? "+" : "−"}${Math.abs(e.ecart)} points)`}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
