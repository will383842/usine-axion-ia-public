import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CODES_SERVICE, CODES_TAILLE, RESEAUX } from "@/contrats";
import { BoutonPrincipal, Icone } from "@/components/ui";
import { COUT_MAX_LIGNE_DEFAUT_EUR, NOMBRE_DEFAUT, NOMBRE_MAX, NOMBRE_MIN, lotsAllume, valeursParDefaut } from "@/lots";
import { FORMATS_PART, LIBELLE_FORMAT, LIBELLE_RESEAU, LIBELLE_SERVICE } from "@/reglages/modele";
import { exigerSession } from "@/services/auth";
import { Retour } from "../../reglages/Champs";
import { preparerLot } from "../actions";
import { RetourVideos, TroisTemps } from "../Apparence";
import { Eteint } from "../Eteint";

export const metadata: Metadata = { title: "Commander des vidéos" };
export const dynamic = "force-dynamic";

function Nombre({ nom, libelle, defaut, min = 0, max, pas = 1, aide, grand = false }: { nom: string; libelle: string; defaut: number; min?: number; max?: number; pas?: number; aide?: string; grand?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{libelle}</span>
      <input
        name={nom}
        type="number"
        inputMode="decimal"
        className={grand ? "champ font-titre text-3xl font-bold tabular-nums min-h-14" : "champ tabular-nums"}
        defaultValue={defaut}
        min={min}
        max={max}
        step={pas}
        required
      />
      {aide ? <span className="text-base text-texte-doux">{aide}</span> : null}
    </label>
  );
}

function Groupe({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-lg font-bold">{titre}</legend>
      {children}
    </fieldset>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  await exigerSession();
  if (!(await lotsAllume())) return <Eteint />;
  const { erreur } = await searchParams;
  const d = await valeursParDefaut();

  return (
    <form action={preparerLot} className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <RetourVideos />
        <h1 className="text-4xl font-bold">Commander des vidéos</h1>
        <TroisTemps actuel={1} />
      </header>
      <Retour erreur={erreur} />
      {d.metiers.length === 0 ? (
        <div role="alert" className="flex items-start gap-3 rounded-3xl border border-rouge bg-rouge-doux p-4 text-rouge">
          <Icone nom="alerte" />
          <p className="font-semibold">
            Aucun métier allumé.{" "}
            <Link href="/sujets" className="underline">
              Choisir mes métiers
            </Link>
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-3xl border border-trait bg-surface p-5 shadow-carte">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-terracotta-doux text-terracotta-fonce">
            <Icone nom="video" />
          </span>
          <Nombre nom="nombre" libelle="Combien de vidéos" defaut={NOMBRE_DEFAUT} min={NOMBRE_MIN} max={NOMBRE_MAX} aide={`De ${NOMBRE_MIN} à ${NOMBRE_MAX}.`} grand />
        </section>
        <section className="flex flex-col gap-4 rounded-3xl border border-trait bg-surface p-5 shadow-carte">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-vert-doux text-vert">
            <Icone nom="euro" />
          </span>
          <Nombre nom="plafond" libelle="Plafond (€)" defaut={d.plafondLotEur} min={0.5} pas={0.5} aide="Jamais plus. Le saisir vaut accord de dépense." grand />
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-3xl border border-trait bg-surface p-5 shadow-carte">
        <h2 className="text-lg font-bold">Réseaux</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {RESEAUX.map((r) => (
            <label
              key={r}
              className="flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border-2 border-trait px-3 font-semibold text-texte-doux has-[:checked]:border-terracotta has-[:checked]:bg-terracotta-doux has-[:checked]:text-terracotta-fonce has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-terracotta"
            >
              <input type="checkbox" name="reseaux" value={r} defaultChecked={d.reseaux.includes(r)} className="sr-only" />
              <Icone nom={r} taille={20} />
              <span className="leading-tight">{LIBELLE_RESEAU[r]}</span>
            </label>
          ))}
        </div>
        <p className="text-base text-texte-doux">TikTok et LinkedIn ne sont jamais cochés d&apos;office.</p>
      </section>

      <details className="group rounded-3xl border border-trait bg-surface p-5 shadow-carte">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-lg font-bold">
          <Icone nom="reglages" />
          Plus de réglages
          <Icone nom="chevron" taille={20} className="ml-auto transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <Groupe titre="Coût">
            <Nombre nom="cout" libelle="Coût maximum par vidéo (€)" defaut={COUT_MAX_LIGNE_DEFAUT_EUR} min={0.5} pas={0.5} />
          </Groupe>
          <Groupe titre="Actualités">
            <Nombre nom="actualites" libelle="Actualités par semaine" defaut={d.actualitesParSemaine} max={7} />
          </Groupe>
          <Groupe titre="Métiers">
            <p className="text-base text-texte-doux">Aucun coché : tous les métiers allumés.</p>
            {d.metiers.map((m) => (
              <label key={m.code} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="metiers" value={m.code} className="size-6 accent-terracotta" />
                <span>{m.nom ?? m.code}</span>
              </label>
            ))}
          </Groupe>
          <Groupe titre="Poids par taille d'entreprise">
            <div className="grid grid-cols-2 gap-3">
              {CODES_TAILLE.map((c) => (
                <Nombre key={c} nom={`taille.${c}`} libelle={c} defaut={d.poidsTaille[c]} max={100} />
              ))}
            </div>
          </Groupe>
          <Groupe titre="Poids par service">
            <div className="grid grid-cols-2 gap-3">
              {CODES_SERVICE.map((c) => (
                <Nombre key={c} nom={`service.${c}`} libelle={LIBELLE_SERVICE[c]} defaut={d.poidsService[c]} max={100} />
              ))}
            </div>
          </Groupe>
          <Groupe titre="Part de chaque format et rythme">
            <ul className="flex flex-col gap-1 text-base">
              {RESEAUX.map((r) => (
                <li key={r}>
                  <span className="font-semibold">{LIBELLE_RESEAU[r]}</span> :{" "}
                  {FORMATS_PART.filter((f) => d.parts[r][f] > 0)
                    .map((f) => `${LIBELLE_FORMAT[f]} ${d.parts[r][f]} %`)
                    .join(", ") || "aucun format"}{" "}
                  · {d.rythmes[r].min} à {d.rythmes[r].max} par semaine
                </li>
              ))}
            </ul>
            <Link href="/reglages/parts" className="inline-flex min-h-11 items-center font-semibold underline">
              Changer dans Réglages
            </Link>
          </Groupe>
        </div>
      </details>

      <BoutonPrincipal icone="fleche">Voir l&apos;aperçu</BoutonPrincipal>
    </form>
  );
}
