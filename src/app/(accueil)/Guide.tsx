import Link from "next/link";
import { CLASSE_DISCRET, CLASSE_PRINCIPAL, Icone, type NomIcone } from "@/components/ui";
import { requete } from "@/lib/base";

export interface EtapeGuide {
  titre: string;
  phrase: string;
  bouton: string;
  lien: string;
  faite: boolean;
  icone: NomIcone;
}

/** Les trois étapes de « Par où commencer », calculées depuis la base (rien à cocher à la main). */
export async function etapesDuGuide(): Promise<EtapeGuide[]> {
  const [r] = await requete<{ metiers: boolean; commande: string | null; colle: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM metier WHERE allume AND etat <> 'retire') AS metiers,
            (SELECT id FROM lot WHERE etat = 'commande' AND archive_le IS NULL ORDER BY numero DESC LIMIT 1) AS commande,
            EXISTS (SELECT 1 FROM lot_ligne WHERE code_version IS NOT NULL AND archive_le IS NULL) AS colle`,
  );
  return [
    { titre: "Choisir mes métiers", phrase: "Vos vidéos parleront d'eux.", bouton: "Choisir", lien: "/sujets", faite: r.metiers, icone: "metier" },
    { titre: "Commander des vidéos", phrase: "Vous relisez avant de commander.", bouton: "Commander", lien: "/lots", faite: r.commande !== null, icone: "video" },
    {
      titre: "Coller dans le studio",
      phrase: "Copiez le texte, notez le code.",
      bouton: "Ouvrir ma commande",
      lien: r.commande ? `/lots/${r.commande}` : "/lots",
      faite: r.colle,
      icone: "coller",
    },
  ];
}

/** « Par où commencer » : trois étapes illustrées, la prochaine mise en avant. `principal` : son bouton est l'action principale de l'écran. */
export function Guide({ etapes, principal }: { etapes: EtapeGuide[]; principal: boolean }) {
  const prochaine = etapes.findIndex((e) => !e.faite);
  const faites = etapes.filter((e) => e.faite).length;
  return (
    <section aria-labelledby="guide" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="guide" className="text-2xl font-bold">
          Par où commencer
        </h2>
        <span className="font-semibold text-texte-doux tabular-nums">
          {faites} / {etapes.length}
        </span>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {etapes.map((e, i) => {
          const enCours = i === prochaine;
          return (
            <li
              key={e.titre}
              data-etat={e.faite ? "faite" : enCours ? "en-cours" : "a-venir"}
              className="flex flex-col gap-3 rounded-3xl border border-trait bg-surface p-5 shadow-carte data-[etat=a-venir]:opacity-75 data-[etat=en-cours]:border-2 data-[etat=en-cours]:border-terracotta"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex size-12 items-center justify-center rounded-2xl ${e.faite ? "bg-vert-doux text-vert" : enCours ? "bg-terracotta text-sur-terracotta" : "bg-gris-doux text-texte-doux"}`}
                >
                  <Icone nom={e.faite ? "coche" : e.icone} />
                </span>
                <span className="font-titre text-3xl font-bold text-trait" aria-hidden>
                  {i + 1}
                </span>
              </div>
              <h3 className="text-xl font-bold">{e.titre}</h3>
              <p className="text-texte-doux">{e.faite ? "C'est fait." : e.phrase}</p>
              <div className="mt-auto">
                <Link href={e.lien} className={enCours && principal ? CLASSE_PRINCIPAL : CLASSE_DISCRET}>
                  {e.faite ? "Revoir" : e.bouton}
                  {enCours ? <Icone nom="fleche" taille={20} /> : null}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
