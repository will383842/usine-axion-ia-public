/**
 * Dépôt générique d'une table : lecture, écriture, archivage. Jamais de suppression :
 * archiver = `etat = 'retire'` (tables des bases) ou `archive_le = now()` (tables de l'Usine).
 * Les noms de colonnes viennent de `schema.ts` (liste blanche) ; les valeurs passent toujours en paramètres.
 * Écrire ne journalise pas : l'appelant appelle `journaliser()` avec une phrase lisible par Will.
 */
import "server-only";
import { requete } from "@/lib/base";

export type Archivage = "etat" | "archive_le" | null;

export interface ConfigDepot {
  table: string;
  cle: string;
  colonnes: readonly string[];
  archivage: Archivage;
  /** Colonnes jsonb : la valeur est envoyée en JSON (sinon `pg` changerait un tableau en tableau PostgreSQL). */
  json?: readonly string[];
}

export interface OptionsListe<L> {
  /** Égalités (une valeur `null` cherche `IS NULL`). */
  ou?: Partial<L>;
  inclureArchives?: boolean;
  ordre?: keyof L & string;
  sens?: "asc" | "desc";
  limite?: number;
}

export interface Depot<L> {
  readonly table: string;
  lire(cle: string | number): Promise<L | null>;
  lister(options?: OptionsListe<L>): Promise<L[]>;
  compter(options?: Pick<OptionsListe<L>, "ou" | "inclureArchives">): Promise<number>;
  /** Ajoute la ligne, ou la met à jour par sa clé (seules les colonnes données changent). */
  ecrire(ligne: Partial<L>): Promise<L>;
  /** Change des colonnes d'une ligne existante ; null si elle n'existe pas. */
  modifier(cle: string | number, champs: Partial<L>): Promise<L | null>;
  /** Retire la ligne sans la supprimer ; null si elle n'existe pas ou si la table ne s'archive pas. */
  archiver(cle: string | number): Promise<L | null>;
}

/** Tables où l'on ne fait qu'ajouter (journal, opposition). */
export interface DepotAjoutSeul<L> {
  readonly table: string;
  lire(cle: string | number): Promise<L | null>;
  lister(options?: Omit<OptionsListe<L>, "inclureArchives">): Promise<L[]>;
  compter(options?: Pick<OptionsListe<L>, "ou">): Promise<number>;
  /** Ajoute la ligne ; null si une ligne identique (contrainte d'unicité) existe déjà. */
  ajouter(ligne: Partial<L>): Promise<L | null>;
}

const SANS_MAJ = new Set(["cree_le", "modifie_le"]);

function colonnesDonnees(config: ConfigDepot, ligne: Record<string, unknown>): string[] {
  const inconnues = Object.keys(ligne).filter((c) => !config.colonnes.includes(c));
  if (inconnues.length) throw new Error(`Colonnes inconnues dans ${config.table} : ${inconnues.join(", ")}.`);
  return Object.keys(ligne).filter((c) => ligne[c] !== undefined && !SANS_MAJ.has(c));
}

function valeur(config: ConfigDepot, colonne: string, v: unknown): unknown {
  return config.json?.includes(colonne) && v !== null ? JSON.stringify(v) : v;
}

function conditions(config: ConfigDepot, ou: Record<string, unknown> = {}, inclureArchives = false, depart = 1) {
  const morceaux: string[] = [];
  const valeurs: unknown[] = [];
  for (const c of colonnesDonnees(config, ou)) {
    if (ou[c] === null) morceaux.push(`"${c}" IS NULL`);
    else {
      valeurs.push(valeur(config, c, ou[c]));
      morceaux.push(`"${c}" = $${depart + valeurs.length - 1}`);
    }
  }
  if (!inclureArchives && config.archivage === "etat") morceaux.push(`etat <> 'retire'`);
  if (!inclureArchives && config.archivage === "archive_le") morceaux.push(`archive_le IS NULL`);
  return { where: morceaux.length ? ` WHERE ${morceaux.join(" AND ")}` : "", valeurs };
}

function lecture<L>(config: ConfigDepot) {
  return {
    table: config.table,
    async lire(cle: string | number): Promise<L | null> {
      const [ligne] = await requete(`SELECT * FROM "${config.table}" WHERE "${config.cle}" = $1`, [cle]);
      return (ligne as L) ?? null;
    },
    async lister(options: OptionsListe<L> = {}): Promise<L[]> {
      const { where, valeurs } = conditions(config, options.ou as Record<string, unknown>, options.inclureArchives);
      const ordre = options.ordre ?? config.cle;
      if (!config.colonnes.includes(ordre)) throw new Error(`Colonne de tri inconnue : ${ordre}.`);
      const limite = options.limite ? ` LIMIT ${Math.max(1, Math.floor(options.limite))}` : "";
      const lignes = await requete(`SELECT * FROM "${config.table}"${where} ORDER BY "${ordre}" ${options.sens === "desc" ? "DESC" : "ASC"}${limite}`, valeurs);
      return lignes as L[];
    },
    async compter(options: Pick<OptionsListe<L>, "ou" | "inclureArchives"> = {}): Promise<number> {
      const { where, valeurs } = conditions(config, options.ou as Record<string, unknown>, options.inclureArchives);
      const [r] = await requete<{ n: string }>(`SELECT count(*) AS n FROM "${config.table}"${where}`, valeurs);
      return Number(r.n);
    },
  };
}

export function creerDepot<L>(config: ConfigDepot): Depot<L> {
  const avecModifieLe = config.colonnes.includes("modifie_le");
  return {
    ...lecture<L>(config),
    async ecrire(ligne: Partial<L>): Promise<L> {
      const donnees = ligne as Record<string, unknown>;
      const colonnes = colonnesDonnees(config, donnees);
      if (!colonnes.length) throw new Error(`Rien à écrire dans ${config.table}.`);
      const valeurs = colonnes.map((c) => valeur(config, c, donnees[c]));
      const liste = colonnes.map((c) => `"${c}"`).join(", ");
      const params = colonnes.map((_, i) => `$${i + 1}`).join(", ");
      const aMettreAJour = colonnes.filter((c) => c !== config.cle).map((c) => `"${c}" = EXCLUDED."${c}"`);
      if (avecModifieLe) aMettreAJour.push("modifie_le = now()");
      const conflit = colonnes.includes(config.cle)
        ? ` ON CONFLICT ("${config.cle}") DO ${aMettreAJour.length ? `UPDATE SET ${aMettreAJour.join(", ")}` : "NOTHING"}`
        : "";
      const [r] = await requete(`INSERT INTO "${config.table}" (${liste}) VALUES (${params})${conflit} RETURNING *`, valeurs);
      return (r as L) ?? ((await this.lire(donnees[config.cle] as string)) as L);
    },
    async modifier(cle: string | number, champs: Partial<L>): Promise<L | null> {
      const donnees = champs as Record<string, unknown>;
      const colonnes = colonnesDonnees(config, donnees).filter((c) => c !== config.cle);
      if (!colonnes.length) return this.lire(cle);
      const sets = colonnes.map((c, i) => `"${c}" = $${i + 2}`);
      if (avecModifieLe) sets.push("modifie_le = now()");
      const [r] = await requete(`UPDATE "${config.table}" SET ${sets.join(", ")} WHERE "${config.cle}" = $1 RETURNING *`, [
        cle,
        ...colonnes.map((c) => valeur(config, c, donnees[c])),
      ]);
      return (r as L) ?? null;
    },
    async archiver(cle: string | number): Promise<L | null> {
      if (!config.archivage) return null;
      const set = config.archivage === "etat" ? "etat = 'retire'" : "archive_le = coalesce(archive_le, now())";
      const [r] = await requete(`UPDATE "${config.table}" SET ${set}${avecModifieLe ? ", modifie_le = now()" : ""} WHERE "${config.cle}" = $1 RETURNING *`, [cle]);
      return (r as L) ?? null;
    },
  };
}

export function creerDepotAjoutSeul<L>(config: Omit<ConfigDepot, "archivage">): DepotAjoutSeul<L> {
  const c: ConfigDepot = { ...config, archivage: null };
  return {
    ...lecture<L>(c),
    async ajouter(ligne: Partial<L>): Promise<L | null> {
      const donnees = ligne as Record<string, unknown>;
      const colonnes = colonnesDonnees(c, donnees);
      const valeurs = colonnes.map((col) => valeur(c, col, donnees[col]));
      const [r] = await requete(
        `INSERT INTO "${c.table}" (${colonnes.map((col) => `"${col}"`).join(", ")}) VALUES (${colonnes.map((_, i) => `$${i + 1}`).join(", ")}) ON CONFLICT DO NOTHING RETURNING *`,
        valeurs,
      );
      return (r as L) ?? null;
    },
  };
}
