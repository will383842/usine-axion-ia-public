import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { Gabarit } from "@/components/gabarit/Gabarit";
import { CODES_ECRANS } from "@/components/gabarit/ecrans";
import { requete } from "@/lib/base";
import "./globals.css";

// Polices du site, rangées dans le dépôt : la construction de l'image ne dépend pas du réseau.
const policeTitre = localFont({ src: "./polices/fraunces-latin.woff2", variable: "--police-titre", weight: "100 900", display: "swap" });
const policeTexte = localFont({ src: "./polices/manrope-latin.woff2", variable: "--police-texte", weight: "200 800", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Usine Axion", template: "%s · Usine Axion" },
  description: "L'Usine Axion : sujets, lots, mots, calendrier.",
  robots: { index: false, follow: false, nocache: true },
  applicationName: "Usine Axion",
};

export const viewport: Viewport = {
  themeColor: "#faf8f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Les écrans dont l'interrupteur est éteint (un code absent vaut « éteint »). Illisible : on n'affiche aucune pastille. */
async function ecransEteints(): Promise<string[]> {
  try {
    const allumes = await requete<{ code: string }>("SELECT code FROM interrupteur WHERE allume AND archive_le IS NULL AND code = ANY($1)", [CODES_ECRANS]);
    const codes = new Set(allumes.map((r) => r.code));
    return CODES_ECRANS.filter((c) => !codes.has(c));
  } catch {
    return [];
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const eteints = await ecransEteints();
  return (
    <html lang="fr" className={`${policeTitre.variable} ${policeTexte.variable} h-full`}>
      <body className="min-h-full bg-fond text-texte">
        <Gabarit eteints={eteints}>{children}</Gabarit>
      </body>
    </html>
  );
}
