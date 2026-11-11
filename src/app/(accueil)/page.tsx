import type { Metadata } from "next";
import Link from "next/link";
import { cartesDuJour, type CarteAffichee } from "@/cartes";
import { CLASSE_DISCRET, CLASSE_PRINCIPAL, Icone, Medaillon, RangeeTuiles, Tuile, type NomIcone } from "@/components/ui";
import { requete } from "@/lib/base";
import { exigerSession } from "@/services/auth";
import { BoutonFait } from "./BoutonFait";
import { Guide, etapesDuGuide } from "./Guide";

export const metadata: Metadata = { title: "Ma journée" };
export const dynamic = "force-dynamic";

/** Les quatre chiffres du haut de l'écran, lus dans la base (semaine = du lundi au dimanche, heure de Paris). */
async function chiffresDuJour() {
  const [r] = await requete<{ a_coller: string; prevues: string; metiers: string; demandes: string }>(
    `WITH semaine AS (SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Paris') AS lundi)
     SELECT (SELECT count(*) FROM lot_ligne WHERE etat = 'a_coller' AND archive_le IS NULL) AS a_coller,
            (SELECT count(DISTINCT coalesce(c.lot_ligne, c.id::text)) FROM calendrier_ligne c, semaine s
              WHERE c.archive_le IS NULL AND c.type_contenu = 'video' AND c.etat <> 'echec'
                AND c.prevue_le AT TIME ZONE 'Europe/Paris' >= s.lundi AND c.prevue_le AT TIME ZONE 'Europe/Paris' < s.lundi + interval '7 days') AS prevues,
            (SELECT count(*) FROM metier WHERE allume AND etat <> 'retire') AS metiers,
            (SELECT coalesce(sum(demandes_guide), 0) FROM releve_mot, semaine s WHERE archive_le IS NULL AND semaine = s.lundi::date) AS demandes`,
  );
  return { aColler: Number(r.a_coller), prevues: Number(r.prevues), metiers: Number(r.metiers), demandes: Number(r.demandes) };
}

/** Le pictogramme d'une carte, d'après l'écran où elle mène. */
function iconeDe(c: CarteAffichee): NomIcone {
  const lien = c.lien ?? "";
  if (lien.startsWith("/lots")) return "coller";
  if (lien.startsWith("/calendrier")) return "calendrier";
  if (lien.startsWith("/nouveautes")) return "nouveaute";
  if (lien.startsWith("/metiers") || lien.startsWith("/sujets")) return "metier";
  if (lien.startsWith("/chiffres") || lien.startsWith("/mots")) return "chiffres";
  if (lien.startsWith("/commenter")) return "communaute";
  return "coche";
}

const dateDuJour = () => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date());

export default async function Page({ searchParams }: { searchParams: Promise<{ guide?: string }> }) {
  await exigerSession();
  const [cartes, etapes, chiffres, { guide }] = await Promise.all([cartesDuJour(), etapesDuGuide(), chiffresDuJour(), searchParams]);
  const toutFait = etapes.every((e) => e.faite);
  const voirGuide = !toutFait || guide === "1";
  // Une seule action principale : la prochaine étape du guide s'il est en cours, sinon la première carte.
  const guidePrincipal = !toutFait;
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="font-semibold text-texte-doux first-letter:uppercase">{dateDuJour()}</p>
        <h1 className="text-4xl font-bold">Bonjour Williams</h1>
      </header>

      <RangeeTuiles>
        <Tuile valeur={chiffres.aColler} libelle="À coller" icone="coller" href="/lots" ton="terracotta" />
        <Tuile valeur={chiffres.prevues} libelle="Prévues cette semaine" icone="calendrier" href="/calendrier" ton="bleu" />
        <Tuile valeur={chiffres.metiers} libelle="Métiers allumés" icone="metier" href="/sujets" ton="ambre" />
        <Tuile valeur={chiffres.demandes} libelle="Demandes reçues" icone="demande" href="/mots" ton="vert" />
      </RangeeTuiles>

      {voirGuide ? <Guide etapes={etapes} principal={guidePrincipal} /> : null}

      <section aria-labelledby="a-faire" className="flex flex-col gap-3">
        <h2 id="a-faire" className="text-2xl font-bold">
          À faire aujourd&apos;hui
        </h2>
        {cartes.length === 0 ? (
          <div className="flex items-center gap-4 rounded-3xl border border-trait bg-vert-doux p-5">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-vert">
              <Icone nom="soleil" />
            </span>
            <div className="flex flex-col">
              <p className="text-xl font-bold text-vert">Rien d&apos;urgent aujourd&apos;hui</p>
              <p className="text-texte-doux">Profitez-en pour commander des vidéos.</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {cartes.map((c, i) => (
              <li key={c.cle} className="flex flex-col gap-4 rounded-3xl border border-trait bg-surface p-5 shadow-carte">
                <div className="flex items-start gap-4">
                  <Medaillon ton={i === 0 ? "terracotta" : "gris"}>
                    <Icone nom={iconeDe(c)} />
                  </Medaillon>
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="text-lg font-bold sm:text-xl">{c.titre}</h3>
                    {c.detail ? <p className="text-base text-texte-doux">{c.detail}</p> : null}
                  </div>
                </div>
                <div className="mt-auto">
                  {c.lien ? (
                    <Link href={c.lien} className={i === 0 && !guidePrincipal ? CLASSE_PRINCIPAL : CLASSE_DISCRET}>
                      {c.bouton}
                      <Icone nom="fleche" taille={20} />
                    </Link>
                  ) : c.id ? (
                    <BoutonFait id={c.id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toutFait && !voirGuide ? (
        <Link href="/?guide=1" className="inline-flex min-h-11 items-center self-start font-semibold text-texte-doux underline">
          Revoir le guide
        </Link>
      ) : null}
    </section>
  );
}
