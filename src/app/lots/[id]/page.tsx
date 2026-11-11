import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ETATS_LOT_LIGNE, idLot, type Reseau } from "@/contrats";
import { Annulable } from "@/components/Annulable";
import { BarreAvancement, BoutonDiscret, BoutonPrincipal, CLASSE_DISCRET, Icone } from "@/components/ui";
import { depots } from "@/donnees";
import { requete } from "@/lib/base";
import { LIBELLE_ETAT, alerteRefus, euros, journalDuLot, lireLot, lotsAllume } from "@/lots";
import { paquetAllume, paquetsDuLot } from "@/lots/paquet";
import { LIBELLE_RESEAU, LIBELLE_SERVICE } from "@/reglages/modele";
import { exigerSession } from "@/services/auth";
import { Retour } from "../../reglages/Champs";
import { archiver, commander, enregistrerLigne, remplacer, retirerDeLApercu } from "../actions";
import { PastilleEtat, Reseaux, RetourVideos, TroisTemps } from "../Apparence";
import { Eteint } from "../Eteint";
import { Paquet } from "./Paquet";

export const metadata: Metadata = { title: "Commande de vidéos" };
export const dynamic = "force-dynamic";

interface Affichee {
  rang: number;
  id: string | null;
  metier: string | null;
  taille: string | null;
  service: string | null;
  cas_usage: string | null;
  actualite: string | null;
  format: string | null;
  reseaux: Reseau[];
  fins: Partial<Record<Reseau, string>>;
}

async function noms(lignes: readonly Affichee[]) {
  const codes = (cle: "metier" | "cas_usage" | "actualite") => [...new Set(lignes.map((l) => l[cle]).filter((c): c is string => Boolean(c)))];
  const appels = [...new Set(lignes.flatMap((l) => Object.values(l.fins)).filter((c): c is string => Boolean(c)))];
  const [metiers, cas, actus, fins] = await Promise.all([
    requete<{ code: string; nom: string | null }>("SELECT code, nom FROM metier WHERE code = ANY($1)", [codes("metier")]),
    requete<{ code: string; nom: string | null }>("SELECT code, titre AS nom FROM cas_usage WHERE code = ANY($1)", [codes("cas_usage")]),
    requete<{ code: string; nom: string | null }>("SELECT code, titre AS nom FROM actualite WHERE code = ANY($1)", [codes("actualite")]),
    requete<{ code: string; nom: string | null }>("SELECT code, coalesce(nullif(dit, ''), nullif(ecran, ''), nullif(legende, ''), objectif) AS nom FROM appel WHERE code = ANY($1)", [appels]),
  ]);
  const m = new Map([...metiers, ...cas, ...actus, ...fins].map((x) => [x.code, x.nom ?? x.code]));
  return (c: string | null) => (c ? (m.get(c) ?? c) : "—");
}

function Ligne({ l, nom, cout }: { l: Affichee; nom: (c: string | null) => string; cout: number }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
      {l.actualite ? (
        <>
          <dt className="font-semibold">Actualité</dt>
          <dd>{nom(l.actualite)}</dd>
        </>
      ) : (
        <>
          <dt className="font-semibold">Métier</dt>
          <dd>{nom(l.metier)}</dd>
          <dt className="font-semibold">Taille</dt>
          <dd>{l.taille ?? "—"}</dd>
          <dt className="font-semibold">Service</dt>
          <dd>{l.service ? (LIBELLE_SERVICE[l.service as keyof typeof LIBELLE_SERVICE] ?? l.service) : "—"}</dd>
          <dt className="font-semibold">Cas</dt>
          <dd>{nom(l.cas_usage)}</dd>
        </>
      )}
      <dt className="font-semibold">Format</dt>
      <dd>{l.format ?? "—"}</dd>
      <dt className="font-semibold">Coût max.</dt>
      <dd>{euros(cout)}</dd>
      {l.reseaux.map((r) => (
        <div key={r} className="contents">
          <dt className="font-semibold">{LIBELLE_RESEAU[r]}</dt>
          <dd>Fin : {nom(l.fins[r] ?? null)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function Page({ params, searchParams }: PageProps<"/lots/[id]">) {
  await exigerSession();
  if (!(await lotsAllume())) return <Eteint />;
  const { id } = await params;
  const sp = await searchParams;
  const erreur = typeof sp.erreur === "string" ? sp.erreur : undefined;
  const etat = typeof sp.etat === "string" ? sp.etat : undefined;
  if (!idLot.safeParse(id).success) notFound();
  const lu = await lireLot(id);
  if (!lu || lu.lot.archive_le) notFound();
  const { lot, reglages, lignes } = lu;
  const plafond = Number(lot.plafond_eur);
  const cout = reglages.coutMaxLigneEur;

  const titre = (
    <>
      <RetourVideos />
      <h1 className="text-4xl font-bold">Commande n° {lot.id.slice(1)}</h1>
    </>
  );

  if (lot.etat === "brouillon") {
    const apercu = reglages.apercu ?? { lignes: [], pourquoi: [], ecartees: [] };
    const nom = await noms(apercu.lignes.map((l) => ({ ...l, id: null })));
    const cumul = apercu.lignes.length * cout;
    return (
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          {titre}
          <TroisTemps actuel={2} />
        </header>
        <Retour erreur={erreur} />
        <div className="grid grid-cols-2 gap-3">
          <Chiffre valeur={`${apercu.lignes.length} / ${lot.nombre}`} libelle="Vidéos proposées" icone="video" />
          <Chiffre valeur={euros(cumul)} libelle={`Au plus · plafond ${euros(plafond)}`} icone="euro" />
        </div>
        {apercu.pourquoi.length ? (
          <div role="status" className="flex items-start gap-3 rounded-3xl border border-ambre bg-ambre-doux p-4 text-ambre">
            <Icone nom="alerte" />
            <div className="flex flex-col gap-1">
              <p className="font-semibold">Pas assez de sujets neufs :</p>
              <ul className="flex flex-col gap-1">
                {apercu.pourquoi.map((p, i) => (
                  <li key={i}>{p.metier ? `${nom(p.metier)} : ${p.message}` : p.message}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        <ol className="grid gap-4 md:grid-cols-2">
          {apercu.lignes.map((l) => (
            <li key={l.rang} className="flex flex-col gap-3 rounded-3xl border border-trait bg-surface p-5 shadow-carte">
              <span className="font-semibold text-texte-doux">Vidéo {l.rang}</span>
              <h2 className="text-xl font-bold">{l.actualite ? "Actualité" : nom(l.metier)}</h2>
              <p className="text-texte-doux">{l.actualite ? nom(l.actualite) : nom(l.cas_usage)}</p>
              <Reseaux reseaux={l.reseaux} />
              <Details>
                <Ligne l={{ ...l, id: null }} nom={nom} cout={cout} />
              </Details>
              <div className="mt-auto flex flex-wrap gap-2">
                <form action={remplacer.bind(null, lot.id, l.rang)}>
                  <BoutonDiscret icone="remplacer">Remplacer</BoutonDiscret>
                </form>
                <form action={retirerDeLApercu.bind(null, lot.id, l.rang)}>
                  <BoutonDiscret icone="retirer">Retirer</BoutonDiscret>
                </form>
              </div>
            </li>
          ))}
        </ol>
        {apercu.lignes.length ? (
          <section className="flex flex-col gap-4 rounded-3xl border-2 border-terracotta bg-surface p-5 shadow-carte">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-terracotta text-base text-sur-terracotta">3</span>
              Confirmer
            </h2>
            <p className="text-texte-doux">
              {apercu.lignes.length} vidéos · {euros(cumul)} au plus · plafond {euros(plafond)}
            </p>
            <form action={commander.bind(null, lot.id)}>
              <BoutonPrincipal icone="coche">Commander ces {apercu.lignes.length} vidéos</BoutonPrincipal>
            </form>
          </section>
        ) : null}
        <div>
          <Annulable libelle="Archiver cet aperçu" message="Aperçu archivé." className={CLASSE_DISCRET} action={archiver.bind(null, lot.id)} />
        </div>
      </section>
    );
  }

  const [nom, refus, journal, paquets] = await Promise.all([
    noms(lignes),
    depots.refus.lister({ ordre: "ordre" }),
    journalDuLot(lot.id),
    paquetAllume().then((allume) => (allume ? paquetsDuLot(lignes) : [])),
  ]);
  const paquetDe = new Map(paquets.map((p) => [p.ligne.id, p]));
  const alerte = alerteRefus(lignes.map((l) => l.etat));
  const compte = (e: (typeof ETATS_LOT_LIGNE)[number]) => lignes.filter((l) => l.etat === e).length;
  // Une seule action principale : « Ouvrir le studio » de la première vidéo à coller, dont le texte est ouvert.
  const premiere = lignes.find((l) => l.etat === "a_coller" && paquetDe.get(l.id)?.controle.ok)?.id;
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">{titre}</header>
      {etat === "commande" ? (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-vert-doux p-4 font-semibold text-vert">
          <Icone nom="coche" />
          Commande passée.
        </p>
      ) : (
        <Retour etat={etat} erreur={erreur} />
      )}
      {alerte ? (
        <div role="alert" className="flex items-start gap-3 rounded-3xl border border-rouge bg-rouge-doux p-4 text-rouge">
          <Icone nom="alerte" />
          <p className="font-semibold">{alerte}</p>
        </div>
      ) : null}

      <section className="flex flex-col gap-4 rounded-3xl border border-trait bg-surface p-5 shadow-carte">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="flex items-baseline gap-2">
            <span className="font-titre text-5xl leading-none font-bold tabular-nums">{lignes.length}</span>
            <span className="text-lg font-semibold text-texte-doux">vidéos</span>
          </p>
          <p className="flex flex-wrap gap-x-4 text-texte-doux">
            <span className="inline-flex items-center gap-1.5">
              <Icone nom="calendrier" taille={18} />
              {lot.commande_le ? new Date(lot.commande_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icone nom="euro" taille={18} />
              {euros(lignes.reduce((s, l) => s + Number(l.cout_max_eur), 0))} au plus · plafond {euros(plafond)}
            </span>
          </p>
        </div>
        <BarreAvancement
          total={lignes.length}
          troncons={[
            { libelle: "publiées", valeur: compte("publiee"), ton: "publie" },
            { libelle: "fabriquées", valeur: compte("fabriquee"), ton: "fait" },
            { libelle: "collées", valeur: compte("collee"), ton: "en-cours" },
            { libelle: "refusées", valeur: compte("refusee"), ton: "refus" },
            { libelle: "à coller", valeur: compte("a_coller"), ton: "neutre" },
          ]}
        />
      </section>

      <ol className="grid items-start gap-4 lg:grid-cols-2">
        {lignes.map((l) => (
          <li key={l.id} className="flex flex-col gap-3 rounded-3xl border border-trait bg-surface p-5 shadow-carte">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-texte-doux">Vidéo {l.rang}</span>
              <PastilleEtat etat={l.etat} />
            </div>
            <h2 className="text-xl font-bold">{l.actualite ? "Actualité" : nom(l.metier)}</h2>
            <p className="text-texte-doux">{l.actualite ? nom(l.actualite) : nom(l.cas_usage)}</p>
            <Reseaux reseaux={l.reseaux} />
            {paquetDe.has(l.id) ? <Paquet p={paquetDe.get(l.id)!} ouvert={l.id === premiere} principal={l.id === premiere} /> : null}
            <details className="group rounded-2xl bg-fond">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-bold">
                <Icone nom="coche" taille={20} />
                Avancement
                {l.code_version ? <span className="ml-auto font-semibold whitespace-nowrap text-texte-doux">{l.code_version}</span> : null}
                <Icone nom="chevron" taille={20} className={`${l.code_version ? "" : "ml-auto "}transition-transform group-open:rotate-90`} />
              </summary>
              <form action={enregistrerLigne.bind(null, l.id)} className="flex flex-col gap-3 px-4 pb-4">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold">État</span>
                  <select name="etat" defaultValue={l.etat} className="champ">
                    {ETATS_LOT_LIGNE.map((e) => (
                      <option key={e} value={e}>
                        {LIBELLE_ETAT[e]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-semibold">Code de la vidéo</span>
                  <input name="code" defaultValue={l.code_version ?? ""} className="champ" placeholder="0042-TB" autoComplete="off" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-semibold">Raison du refus (si refusée)</span>
                  <select name="refus" defaultValue={l.refus ?? ""} className="champ">
                    <option value="">—</option>
                    {refus.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.nom}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <BoutonDiscret>Enregistrer</BoutonDiscret>
                </div>
              </form>
            </details>
            <Details>
              <Ligne l={l} nom={nom} cout={Number(l.cout_max_eur)} />
            </Details>
          </li>
        ))}
      </ol>

      <details className="group rounded-3xl border border-trait bg-surface p-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-lg font-bold">
          <Icone nom="horloge" />
          Journal de la commande
          <Icone nom="chevron" taille={20} className="ml-auto transition-transform group-open:rotate-90" />
        </summary>
        <ul className="mt-3 flex flex-col gap-2 text-base">
          {journal.map((j, i) => (
            <li key={i}>
              <span className="text-texte-doux">{new Date(j.le).toLocaleString("fr-FR")}</span> · {j.message}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Un chiffre du résumé de l'aperçu. */
function Chiffre({ valeur, libelle, icone }: { valeur: string; libelle: string; icone: "video" | "euro" }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-trait bg-surface p-4 shadow-carte">
      <Icone nom={icone} className="text-terracotta" />
      <span className="font-titre text-3xl leading-none font-bold tabular-nums">{valeur}</span>
      <span className="text-base font-semibold text-texte-doux">{libelle}</span>
    </div>
  );
}

/** Le détail d'une vidéo (taille, service, format, coût, fins), replié. */
function Details({ children }: { children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-texte-doux">
        Détails
        <Icone nom="chevron" taille={18} className="transition-transform group-open:rotate-90" />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}
