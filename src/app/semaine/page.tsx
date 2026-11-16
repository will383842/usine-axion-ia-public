import type { Metadata } from "next";
import { EnTete, EtatVide } from "@/components/gabarit/EnTete";
import { lignesDuCalendrier } from "@/calendrier";
import { lundiVise, planificationAllumee } from "@/planification";
import { ajouterJours } from "@/calendrier/regles";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { exigerSession } from "@/services/auth";
import { ProposerLaSemaine } from "./ProposerLaSemaine";

export const metadata: Metadata = { title: "Ma semaine" };
export const dynamic = "force-dynamic";

const NOM_TYPE: Record<string, string> = { video: "Vidéo", carrousel: "Carrousel", image: "Texte avec image", texte: "Texte seul", story: "Story" };
const jourLisible = (jour: string) => new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function Page() {
  await exigerSession();
  if (!(await planificationAllumee())) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-5">
        <h1 className="text-3xl font-bold">Ma semaine</h1>
        <p>Cet écran est éteint : allumez-le dans Réglages › Interrupteurs.</p>
      </section>
    );
  }
  const lundi = await lundiVise();
  const lignes = await lignesDuCalendrier(lundi, ajouterJours(lundi, 6));
  const jours = [...new Set(lignes.map((l) => l.jour))];
  return (
    <section className="flex flex-col gap-6">
      <EnTete titre="Ma semaine" phrase="L'Usine propose les jours de publication de la semaine, selon vos rythmes et vos quotas, sans rien reprendre aux dates que vous avez choisies. Le Studio les garde « à valider » : rien n'est publié sans votre accord." />
      <ProposerLaSemaine />
      {jours.length === 0 ? (
        <EtatVide message="Rien de prévu cette semaine. Placez d'abord vos vidéos dans le calendrier." bouton={{ href: "/calendrier", libelle: "Ouvrir mon calendrier" }} />
      ) : (
        <ul className="flex flex-col gap-4">
          {jours.map((jour) => (
            <li key={jour} className="flex flex-col gap-2 rounded-2xl border border-trait bg-surface p-4">
              <h2 className="text-xl font-bold first-letter:uppercase">{jourLisible(jour)}</h2>
              <ul className="flex flex-col gap-1">
                {lignes
                  .filter((l) => l.jour === jour)
                  .map((l) => (
                    <li key={l.id}>
                      {NOM_TYPE[l.type_contenu] ?? l.type_contenu} · {LIBELLE_RESEAU[l.reseau]}
                      {l.metier ? ` · ${l.metier}` : ""}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
