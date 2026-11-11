import type { ReactNode } from "react";

/**
 * Pictogrammes en SVG en ligne (trait de 2, 24 × 24, couleur du texte) : aucune bibliothèque, aucune image extérieure.
 * Décoratifs par défaut (`aria-hidden`) ; `titre` les rend lisibles par un lecteur d'écran quand ils portent seuls le sens.
 */
const DESSINS = {
  video: (
    <>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m16 10 6-3v10l-6-3" />
    </>
  ),
  calendrier: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  metier: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  demande: (
    <>
      <path d="M4 4h16v12H8l-4 4z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  coller: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </>
  ),
  copier: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  coche: <path d="m5 12 5 5 9-10" />,
  croix: <path d="M6 6l12 12M18 6 6 18" />,
  publie: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </>
  ),
  ouvrir: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  fleche: <path d="M5 12h14M13 6l6 6-6 6" />,
  retour: <path d="M19 12H5M11 6l-6 6 6 6" />,
  remplacer: (
    <>
      <path d="M4 10a8 8 0 0 1 14-4l2 2M20 4v4h-4" />
      <path d="M20 14a8 8 0 0 1-14 4l-2-2M4 20v-4h4" />
    </>
  ),
  retirer: <path d="M5 12h14" />,
  soleil: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  nouveaute: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10M7 12h10M7 16h6" />
    </>
  ),
  chiffres: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  communaute: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" />
    </>
  ),
  alerte: (
    <>
      <path d="M12 3 2 21h20z" />
      <path d="M12 10v5M12 18h.01" />
    </>
  ),
  euro: (
    <>
      <path d="M18 6a7 7 0 1 0 0 12" />
      <path d="M4 10h9M4 14h9" />
    </>
  ),
  reglages: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  horloge: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  // Réseaux : formes simples reconnaissables, sans logo de marque.
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" />
    </>
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  facebook: <path d="M15 3h-2a4 4 0 0 0-4 4v3H6v4h3v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2z" />,
  tiktok: <path d="M14 3v12a4 4 0 1 1-4-4M14 3a5 5 0 0 0 5 5" />,
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="m10 9 5 3-5 3z" />
    </>
  ),
  "youtube-shorts": (
    <>
      <rect x="6" y="2" width="12" height="20" rx="4" />
      <path d="m10 9 5 3-5 3z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NomIcone = keyof typeof DESSINS;

export function Icone({ nom, taille = 24, titre, className }: { nom: NomIcone; taille?: number; titre?: string; className?: string }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ""}`}
      role={titre ? "img" : undefined}
      aria-hidden={titre ? undefined : true}
      aria-label={titre}
    >
      {titre ? <title>{titre}</title> : null}
      {DESSINS[nom]}
    </svg>
  );
}
