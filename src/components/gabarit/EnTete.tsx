import Link from "next/link";

/** En tête de chaque écran du menu : son titre, une phrase qui dit à quoi il sert, et au plus un bouton principal. */
export function EnTete({ titre, phrase, bouton }: { titre: string; phrase: string; bouton?: { href: string; libelle: string } }) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold">{titre}</h1>
      <p className="text-texte-doux">{phrase}</p>
      {bouton ? (
        <Link href={bouton.href} className="bouton self-start">
          {bouton.libelle}
        </Link>
      ) : null}
    </header>
  );
}

/** Ce qu'un écran vide dit : quoi faire ensuite, avec un bouton vers l'étape d'avant. */
export function EtatVide({ message, bouton }: { message: string; bouton?: { href: string; libelle: string } }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-trait bg-surface p-4">
      <p className="font-semibold">{message}</p>
      {bouton ? (
        <Link href={bouton.href} className="bouton self-start">
          {bouton.libelle}
        </Link>
      ) : null}
    </div>
  );
}

/** Onglets d'une page (des liens : chaque onglet a son adresse, `?onglet=…`). */
export function Onglets({ onglets, actif }: { onglets: readonly { cle: string; libelle: string; href: string }[]; actif: string }) {
  return (
    <nav aria-label="Onglets" className="flex flex-wrap gap-2 border-b border-trait pb-3">
      {onglets.map((o) => (
        <Link
          key={o.cle}
          href={o.href}
          aria-current={o.cle === actif ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-full border border-trait px-4 font-semibold text-texte-doux aria-[current=page]:border-terracotta aria-[current=page]:bg-terracotta-doux aria-[current=page]:text-terracotta-fonce"
        >
          {o.libelle}
        </Link>
      ))}
    </nav>
  );
}
