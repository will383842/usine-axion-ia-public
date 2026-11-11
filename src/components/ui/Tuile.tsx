import Link from "next/link";
import { Icone, type NomIcone } from "./Icone";

/** Une tuile-chiffre : un grand nombre, un pictogramme, un libellé de trois mots au plus. Touchée, elle mène à l'écran du chiffre. */
export function Tuile({ valeur, libelle, icone, href, ton = "terracotta" }: { valeur: number; libelle: string; icone: NomIcone; href?: string; ton?: "terracotta" | "vert" | "bleu" | "ambre" }) {
  const couleurs = {
    terracotta: "bg-terracotta-doux text-terracotta-fonce",
    vert: "bg-vert-doux text-vert",
    bleu: "bg-bleu-doux text-bleu",
    ambre: "bg-ambre-doux text-ambre",
  }[ton];
  const contenu = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-titre text-4xl leading-none font-bold tabular-nums">{valeur.toLocaleString("fr-FR")}</span>
        <span className={`inline-flex size-10 items-center justify-center rounded-xl ${couleurs}`}>
          <Icone nom={icone} taille={22} />
        </span>
      </span>
      <span className="leading-tight font-semibold text-texte-doux">{libelle}</span>
    </>
  );
  const classe = "flex min-h-28 flex-col justify-between gap-3 rounded-3xl border border-trait bg-surface p-4 shadow-carte";
  return href ? (
    <Link href={href} className={`${classe} transition-colors hover:border-terracotta`}>
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

/** La rangée de tuiles : deux colonnes au téléphone, quatre sur écran large. */
export function RangeeTuiles({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}
