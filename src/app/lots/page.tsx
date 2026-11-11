import type { Metadata } from "next";
import Link from "next/link";
import { BarreAvancement, BoutonPrincipal, Icone, Medaillon, Pastille } from "@/components/ui";
import { requete } from "@/lib/base";
import { alerteDesRefus, euros, lotsAllume } from "@/lots";
import { exigerSession } from "@/services/auth";
import { Eteint } from "./Eteint";

export const metadata: Metadata = { title: "Mes vidéos" };
export const dynamic = "force-dynamic";

interface LigneListe {
  id: string;
  nombre: number;
  plafond_eur: string;
  etat: "brouillon" | "commande";
  le: Date;
  lignes: string;
  a_coller: string;
  collees: string;
  fabriquees: string;
  refusees: string;
  publiees: string;
}

export default async function Page() {
  await exigerSession();
  if (!(await lotsAllume())) return <Eteint />;
  const [alerte, [{ metiers }], lots] = await Promise.all([
    alerteDesRefus(),
    requete<{ metiers: boolean }>("SELECT EXISTS (SELECT 1 FROM metier WHERE allume AND etat <> 'retire') AS metiers"),
    requete<LigneListe>(
      `SELECT o.id, o.nombre, o.plafond_eur, o.etat, coalesce(o.commande_le, o.cree_le) AS le,
              count(l.id) AS lignes,
              count(l.id) FILTER (WHERE l.etat = 'a_coller') AS a_coller,
              count(l.id) FILTER (WHERE l.etat = 'collee') AS collees,
              count(l.id) FILTER (WHERE l.etat = 'fabriquee') AS fabriquees,
              count(l.id) FILTER (WHERE l.etat = 'refusee') AS refusees,
              count(l.id) FILTER (WHERE l.etat = 'publiee') AS publiees
         FROM lot o LEFT JOIN lot_ligne l ON l.lot = o.id AND l.archive_le IS NULL
        WHERE o.archive_le IS NULL
        GROUP BY o.id ORDER BY o.numero DESC LIMIT 50`,
    ),
  ]);

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-4xl font-bold">Mes vidéos</h1>
        {metiers ? (
          <BoutonPrincipal href="/lots/nouveau" icone="plus">
            Commander des vidéos
          </BoutonPrincipal>
        ) : (
          <BoutonPrincipal href="/sujets" icone="metier">
            Choisir mes métiers
          </BoutonPrincipal>
        )}
      </header>

      {alerte ? (
        <div role="alert" className="flex items-start gap-3 rounded-3xl border border-rouge bg-rouge-doux p-4 text-rouge">
          <Icone nom="alerte" />
          <p className="font-semibold">{alerte}</p>
        </div>
      ) : null}

      {lots.length === 0 ? (
        <div className="flex items-center gap-4 rounded-3xl border border-trait bg-surface p-5 shadow-carte">
          <Medaillon>
            <Icone nom="video" />
          </Medaillon>
          <div className="flex flex-col">
            <p className="text-xl font-bold">Aucune commande</p>
            <p className="text-texte-doux">{metiers ? "Votre première commande apparaîtra ici." : "Allumez d'abord un métier."}</p>
          </div>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lots.map((l) => {
            const date = new Date(l.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
            const brouillon = l.etat === "brouillon";
            const total = brouillon ? l.nombre : Number(l.lignes);
            return (
              <li key={l.id}>
                <Link
                  href={`/lots/${l.id}`}
                  className="flex h-full flex-col gap-4 rounded-3xl border border-trait bg-surface p-5 shadow-carte transition-colors hover:border-terracotta"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-texte-doux">Commande n° {l.id.slice(1)}</span>
                    {brouillon ? (
                      <Pastille ton="neutre" icone="horloge">
                        À confirmer
                      </Pastille>
                    ) : Number(l.a_coller) > 0 ? (
                      <Pastille ton="attente" icone="coller">
                        {l.a_coller} à coller
                      </Pastille>
                    ) : (
                      <Pastille ton="publie" icone="coche">
                        Tout collé
                      </Pastille>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-titre text-5xl leading-none font-bold tabular-nums">{total}</span>
                    <span className="text-lg font-semibold text-texte-doux">vidéos</span>
                  </div>
                  {brouillon ? null : (
                    <BarreAvancement
                      total={total}
                      troncons={[
                        { libelle: "publiées", valeur: Number(l.publiees), ton: "publie" },
                        { libelle: "fabriquées", valeur: Number(l.fabriquees), ton: "fait" },
                        { libelle: "collées", valeur: Number(l.collees), ton: "en-cours" },
                        { libelle: "refusées", valeur: Number(l.refusees), ton: "refus" },
                      ]}
                    />
                  )}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-trait pt-3 text-texte-doux">
                    <span className="inline-flex items-center gap-1.5">
                      <Icone nom="calendrier" taille={18} />
                      {date}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Icone nom="euro" taille={18} />
                      Plafond {euros(Number(l.plafond_eur))}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <nav aria-label="Autres pages" className="flex flex-wrap gap-x-6 gap-y-1">
        <Link href="/calendrier" className="inline-flex min-h-11 items-center gap-2 font-semibold text-texte-doux hover:text-texte">
          <Icone nom="calendrier" taille={20} />
          Mon calendrier
        </Link>
        <Link href="/lots/deja-fabrique" className="inline-flex min-h-11 items-center gap-2 font-semibold text-texte-doux hover:text-texte">
          <Icone nom="video" taille={20} />
          Déjà fabriqué avant l&apos;Usine
        </Link>
      </nav>
    </section>
  );
}
