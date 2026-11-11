/**
 * Le menu : six lignes, chacune avec son nom et la phrase qui dit à quoi elle sert (menu latéral sur grand écran,
 * « Plus » au téléphone). `codes` : les interrupteurs des écrans de la ligne ; la pastille « éteint » paraît quand
 * ils sont tous éteints.
 */
export interface EntreeMenu {
  href: string;
  libelle: string;
  phrase: string;
  codes?: readonly string[];
  /** Autres adresses qui marquent cette ligne comme la page courante. */
  aussi?: readonly string[];
}

export const MENU: readonly EntreeMenu[] = [
  { href: "/", libelle: "Ma journée", phrase: "Ce que j'ai à faire aujourd'hui" },
  { href: "/lots", libelle: "Mes vidéos", phrase: "Commander des vidéos et suivre celles en cours", codes: ["lots"] },
  { href: "/calendrier", libelle: "Mon calendrier", phrase: "Ce qui sort, quel jour, sur quel réseau", codes: ["calendrier"] },
  {
    href: "/sujets",
    libelle: "Mes idées de sujets",
    phrase: "Mes métiers et les nouveautés de la semaine",
    codes: ["metiers", "nouveautes"],
    aussi: ["/metiers", "/nouveautes"],
  },
  {
    href: "/mots",
    libelle: "Mes mots et cadeaux",
    phrase: "Les mots à commenter, les messages envoyés, les cadeaux, les demandes reçues",
    codes: ["mots", "chiffres"],
    aussi: ["/chiffres"],
  },
  { href: "/commenter", libelle: "Ma communauté", phrase: "Les comptes chez qui commenter aujourd'hui", codes: ["commenter.allume"] },
];

/** En bas du menu, séparé et discret. */
export const REGLAGES: EntreeMenu = { href: "/reglages", libelle: "Réglages", phrase: "" };

/** Navigation basse du téléphone : trois accès directs, puis « Plus » (le menu complet). */
export const NAVIGATION_BASSE = [
  { href: "/", libelle: "Ma journée" },
  { href: "/lots", libelle: "Mes vidéos" },
  { href: "/calendrier", libelle: "Mon calendrier" },
] as const;

export const URL_STUDIO = "https://studio.axion-ia.com";

/** Pages sans gabarit (pas encore connecté). */
export const SANS_GABARIT = ["/connexion"];

const sous = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

export function estActif(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  const entree = [...MENU, REGLAGES].find((e) => e.href === href);
  return sous(href, pathname) || (entree?.aussi ?? []).some((a) => sous(a, pathname));
}
