import type { Metadata } from "next";
import { estArrete } from "@/arret";
import { INTERRUPTEUR_COMMANDES } from "@/commandes/regles";
import { PHRASE_ARRET_LECTURE, lireAValider } from "@/commandes/validation";
import { EnTete, EtatVide } from "@/components/gabarit/EnTete";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { URL_STUDIO } from "@/components/gabarit/navigation";
import { interrupteurAllume, type CommandeStudio } from "@/donnees";
import { requete } from "@/lib/base";
import { LIBELLE_RESEAU } from "@/reglages/modele";
import { exigerSession } from "@/services/auth";
import { CarteAValider, type DonneesCarte } from "./CarteAValider";

export const metadata: Metadata = { title: "À valider" };
export const dynamic = "force-dynamic";

const MAX_CARTES = 10;
const PHRASE_TETE = "Ce que le Studio a préparé, à valider ou à refuser avant la mise en ligne. Rien ne part sans votre geste.";

const quand = (instant: Date) =>
  new Date(instant).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

const nomReseau = (r: string) => (LIBELLE_RESEAU as Record<string, string>)[r] ?? r;

export default async function Page() {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_COMMANDES))) return <EcranEteint code={INTERRUPTEUR_COMMANDES} />;

  const lignes = await requete<CommandeStudio>(
    `SELECT *, jour::text AS jour FROM commande_studio
      WHERE archive_le IS NULL AND etat_studio IN ('recue', 'a_valider') AND valide_le IS NULL AND refuse_le IS NULL
      ORDER BY instant, cle LIMIT $1`,
    [MAX_CARTES + 1],
  );
  const affichees = lignes.slice(0, MAX_CARTES);
  let autres = 0;
  if (lignes.length > MAX_CARTES) {
    const [r] = await requete<{ n: string }>(
      `SELECT count(*) AS n FROM commande_studio WHERE archive_le IS NULL AND etat_studio IN ('recue', 'a_valider') AND valide_le IS NULL AND refuse_le IS NULL`,
    );
    autres = Math.max(0, Number(r?.n ?? 0) - MAX_CARTES);
  }

  const arrete = await estArrete();
  const calendrierStudio = `${URL_STUDIO}/calendrier`;
  const noms = new Map(
    (await requete<{ code: string; nom: string }>(`SELECT code, nom FROM compte WHERE code = ANY($1)`, [affichees.map((l) => l.compte)])).map((c) => [c.code, c.nom]),
  );
  const cartes: DonneesCarte[] = [];
  for (const l of affichees) {
    const base = { cle: l.cle, reseau: nomReseau(l.reseau), compte: noms.get(l.compte) ?? "Compte du Studio", quand: quand(l.instant), lienCalendrierStudio: calendrierStudio };
    if (arrete) {
      cartes.push({ ...base, texte: null, premierCommentaire: null, empreinte: "", lienStudio: null, etat: "indisponible" });
      continue;
    }
    const lu = await lireAValider(l.cle);
    if (!lu.lisible) {
      cartes.push({ ...base, texte: lu.phrase, premierCommentaire: null, empreinte: "", lienStudio: null, etat: "indisponible" });
      continue;
    }
    const d = lu.donnees;
    const lienStudio = d.media ? `${URL_STUDIO}/${d.media.type === "video" ? "videos" : "carrousels"}/${encodeURIComponent(d.media.id)}` : null;
    cartes.push({
      ...base,
      texte: d.textes?.texte ?? null,
      premierCommentaire: d.textes?.premierCommentaire ?? null,
      empreinte: d.empreinte,
      lienStudio,
      etat: d.valideeLe ? "validee" : d.media ? "a_valider" : "sans_media",
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <EnTete titre="À valider" phrase={PHRASE_TETE} />
      {arrete ? (
        <p role="status" className="rounded-xl border border-terracotta bg-surface p-3 font-semibold">
          {PHRASE_ARRET_LECTURE}
        </p>
      ) : null}
      {cartes.length === 0 ? <EtatVide message="Rien à valider pour l'instant. Proposez une ligne du calendrier au Studio pour la voir ici." bouton={{ href: "/calendrier", libelle: "Ouvrir mon calendrier" }} /> : null}
      <ul className="flex flex-col gap-4">
        {cartes.map((c) => (
          <li key={c.cle}>
            <CarteAValider d={c} />
          </li>
        ))}
      </ul>
      {autres > 0 ? <p className="text-texte-doux">{`${autres} autres attendent : validez celles-ci d'abord.`}</p> : null}
      <p className="text-texte-doux">
        Les scripts se valident encore dans le Studio.{" "}
        <a className="inline-flex min-h-11 items-center underline" href={URL_STUDIO} target="_blank" rel="noopener noreferrer">
          Ouvrir le Studio
        </a>
      </p>
    </section>
  );
}
