/**
 * Copie des bases (bases/*.md) et son témoin `bases.source.json` (ADR 0001, une seule copie des bases).
 * Sans dépendance au serveur : lu par les essais, par les scripts de garde et par /api/sante.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type TemoinBases = {
  version: number;
  source: string;
  commit: string;
  fichiers: Record<string, string>;
  empreinte: string;
  synchronise_le?: string;
};

export const sha256 = (octets: Buffer | string) => createHash("sha256").update(octets).digest("hex");

/** Empreinte unique : sha256 de la concaténation « nom:sha256\n », triée par nom (format du manifeste de l'ADR 0001). */
export function empreinteDe(fichiers: Record<string, string>): string {
  const lignes = Object.keys(fichiers)
    .sort()
    .map((nom) => `${nom}:${fichiers[nom]}\n`)
    .join("");
  return sha256(lignes);
}

/** sha256 de chaque fichier `*.md` du dossier (sans descendre dans les sous-dossiers). */
export function empreintesDuDossier(dossier: string): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const nom of readdirSync(dossier).filter((n) => n.endsWith(".md")).sort()) {
    resultat[nom] = sha256(readFileSync(join(dossier, nom)));
  }
  return resultat;
}

/** Garde interne : la copie est identique à ce que déclare son témoin. Renvoie les écarts (vide = conforme). */
export function ecartsInternes(dossier: string, temoin: TemoinBases): string[] {
  const ecarts: string[] = [];
  const reel = empreintesDuDossier(dossier);
  for (const [nom, sha] of Object.entries(temoin.fichiers)) {
    if (!(nom in reel)) ecarts.push(`manquant : ${nom}`);
    else if (reel[nom] !== sha) ecarts.push(`modifié à la main : ${nom}`);
  }
  for (const nom of Object.keys(reel)) if (!(nom in temoin.fichiers)) ecarts.push(`en trop : ${nom}`);
  if (empreinteDe(temoin.fichiers) !== temoin.empreinte) ecarts.push("empreinte déclarée ≠ empreinte recalculée");
  return ecarts;
}

/** Garde externe : le témoin recopie le manifeste actuel de la source. Renvoie les écarts (vide = à jour). */
export function ecartsExternes(temoin: TemoinBases, manifeste: Pick<TemoinBases, "commit" | "fichiers" | "empreinte">): string[] {
  const ecarts: string[] = [];
  if (temoin.empreinte !== manifeste.empreinte) ecarts.push(`empreinte ${temoin.empreinte.slice(0, 8)} ≠ source ${manifeste.empreinte.slice(0, 8)}`);
  for (const [nom, sha] of Object.entries(manifeste.fichiers)) {
    if (!(nom in temoin.fichiers)) ecarts.push(`absent de la copie : ${nom}`);
    else if (temoin.fichiers[nom] !== sha) ecarts.push(`différent de la source : ${nom}`);
  }
  for (const nom of Object.keys(temoin.fichiers)) if (!(nom in manifeste.fichiers)) ecarts.push(`absent de la source : ${nom}`);
  return ecarts;
}

/** Le témoin que le script de synchro écrit à partir du dossier source. */
export function construireTemoin(dossierSource: string, commit: string, source = "axion-plans-prive/usine/bases/pour-la-machine"): TemoinBases {
  const fichiers = empreintesDuDossier(dossierSource);
  return { version: 1, source, commit, fichiers, empreinte: empreinteDe(fichiers), synchronise_le: new Date().toISOString() };
}
