import { BoutonCopier, BoutonDiscret, BoutonPrincipal, Icone } from "@/components/ui";
import type { PaquetDeLigne } from "@/lots/paquet";
import { ADRESSE_STUDIO, champsAColler } from "@/lots/paquet";

/** Le texte à coller, ouvert dans la carte de la vidéo : chaque champ avec « Copier », puis « Ouvrir le studio » ; ou les raisons du refus. */
export function Paquet({ p, ouvert, principal }: { p: PaquetDeLigne; ouvert: boolean; principal: boolean }) {
  return (
    <details open={ouvert} className="group rounded-2xl bg-fond">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-bold">
        <Icone nom="coller" taille={20} />
        Texte à coller
        <Icone nom="chevron" taille={20} className="ml-auto transition-transform group-open:rotate-90" />
      </summary>
      {p.controle.ok ? (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <dl className="flex flex-col gap-2">
            {champsAColler(p.controle.paquet).map((c) => (
              <div key={c.cle} className="flex flex-col gap-1 rounded-xl bg-surface p-3">
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <dt className="font-semibold text-texte-doux">{c.libelle}</dt>
                  {c.texte ? <BoutonCopier texte={c.texte} quoi={c.libelle} /> : null}
                </div>
                <dd className="break-words whitespace-pre-line">{c.texte || "(laisser vide)"}</dd>
              </div>
            ))}
          </dl>
          {principal ? (
            <BoutonPrincipal href={ADRESSE_STUDIO} externe icone="ouvrir">
              Ouvrir le studio
            </BoutonPrincipal>
          ) : (
            <BoutonDiscret href={ADRESSE_STUDIO} externe icone="ouvrir">
              Ouvrir le studio
            </BoutonDiscret>
          )}
        </div>
      ) : (
        <div role="alert" className="flex flex-col gap-1 px-4 pb-4 text-rouge">
          <p className="font-semibold">Texte refusé, à reprendre dans la fiche :</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {p.controle.refus.map((r, i) => (
              <li key={i}>{r.raison}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
