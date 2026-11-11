/**
 * Lignes de départ des tables de l'Usine posées par l'import : les 4 services et les 6 comptes reliés à Buffer
 * (au 12/10). Ajoutées si elles manquent, jamais réécrites : ensuite, c'est l'Usine qui fait foi.
 * Tout naît « à valider » (`propose`) et éteint (`actif = false`).
 */
import type { CodeService, NatureCompte, Reseau, SerieStudio } from "@/contrats";

export interface ServiceDepart {
  code: CodeService;
  nom: string;
  serie_studio: SerieStudio;
  passage_site: string;
  ordre: number;
}

/** Contrat § 1 : `service.code`, passage studio (série) et passage site. */
export const SERVICES_DEPART: ServiceDepart[] = [
  { code: "formation", nom: "Formation", serie_studio: "formation", passage_site: "interventions", ordre: 1 },
  { code: "audit", nom: "Audit", serie_studio: "audit", passage_site: "audit", ordre: 2 },
  { code: "coaching", nom: "Coaching", serie_studio: "coaching", passage_site: "UN_A_UN_*", ordre: 3 },
  { code: "integration", nom: "Intégration", serie_studio: "automatisations", passage_site: "implementation", ordre: 4 },
];

export interface CompteDepart {
  code: string;
  reseau: Reseau;
  identifiant: string;
  nature: NatureCompte;
  nom: string;
}

/** Les six comptes reliés à Buffer au 12/10 (contrat § 1, `compte.code`). */
export const COMPTES_DEPART: CompteDepart[] = [
  { code: "instagram:williamsjullin", reseau: "instagram", identifiant: "williamsjullin", nature: "compte", nom: "williamsjullin" },
  { code: "facebook:williamsjullin", reseau: "facebook", identifiant: "williamsjullin", nature: "page", nom: "Williams Jullin" },
  { code: "facebook:axion-ia.com", reseau: "facebook", identifiant: "axion-ia.com", nature: "page", nom: "Axion-IA.com" },
  { code: "linkedin:williamsjullin", reseau: "linkedin", identifiant: "williamsjullin", nature: "profil", nom: "Williams Jullin" },
  { code: "linkedin:axion-ia-france", reseau: "linkedin", identifiant: "axion-ia-france", nature: "page", nom: "axion-ia-france" },
  { code: "tiktok:williamsjullin", reseau: "tiktok", identifiant: "williamsjullin", nature: "compte", nom: "williamsjullin" },
];

export const SOURCE_SERVICES = "CONTRATS-ECHANGE.md § 1 (service.code)";
export const SOURCE_COMPTES = "Buffer, six comptes reliés au 12/10 ; CONTRATS-ECHANGE.md § 1 (compte.code)";
