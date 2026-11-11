/** T14 · Chiffres par mot : saisie hebdomadaire, courbe et rapport par mot, objectif de visibilité par compte, carte hebdomadaire. */
import "server-only";
import { depots, interrupteurAllume, journaliser } from "@/donnees";
import { requete } from "@/lib/base";
import {
  INTERRUPTEUR_CARTE_RELEVE,
  INTERRUPTEUR_CHIFFRES,
  RESEAUX_DES_MOTS,
  SEMAINES_COURBE,
  lundiDe,
  rapportDuMot,
  schemaObjectif,
  schemaReleve,
  serieDuMot,
  ajouterJours,
  type LigneReleve,
  type Releve,
} from "./regles";

export * from "./regles";

export class ErreurChiffres extends Error {}

export const chiffresAllume = () => interrupteurAllume(INTERRUPTEUR_CHIFFRES);

async function exigerAllume() {
  if (!(await chiffresAllume())) throw new ErreurChiffres("L'écran Chiffres est éteint : allumez-le dans Réglages › Interrupteurs.");
}

export const aujourdhuiParis = async () =>
  (await requete<{ j: string }>(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS j`))[0].j;

/** Enregistre (ou corrige) les chiffres d'un mot et d'un compte pour une semaine : une ligne par semaine, mot et compte. */
export async function enregistrerReleve(saisie: unknown): Promise<Releve> {
  await exigerAllume();
  const lu = schemaReleve.safeParse(saisie);
  if (!lu.success) throw new ErreurChiffres(lu.error.issues[0].message);
  const r = lu.data;
  const [mot, compte] = await Promise.all([depots.mot.lire(r.mot), depots.compte.lire(r.compte)]);
  if (!mot || mot.archive_le) throw new ErreurChiffres("Mot inconnu.");
  if (!compte || compte.archive_le) throw new ErreurChiffres("Compte inconnu.");
  await requete(
    `INSERT INTO releve_mot (semaine, mot, compte, commentaires, messages, demandes_guide, abonnes_gagnes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (semaine, mot, compte) DO UPDATE
       SET commentaires = EXCLUDED.commentaires, messages = EXCLUDED.messages, demandes_guide = EXCLUDED.demandes_guide,
           abonnes_gagnes = EXCLUDED.abonnes_gagnes, archive_le = NULL, modifie_le = now()`,
    [r.semaine, r.mot, r.compte, r.commentaires, r.messages, r.demandesGuide, r.abonnesGagnes],
  );
  await journaliser("chiffres", `Chiffres de la semaine du ${r.semaine} : ${mot.mot} sur ${compte.nom ?? compte.code}.`, { cible: `releve_mot:${r.mot}:${r.compte}:${r.semaine}` });
  return r;
}

/** L'objectif de visibilité d'un compte, saisi par Will (texte libre ; vide = aucun objectif). */
export async function enregistrerObjectif(saisie: unknown): Promise<void> {
  await exigerAllume();
  const lu = schemaObjectif.safeParse(saisie);
  if (!lu.success) throw new ErreurChiffres(lu.error.issues[0].message);
  const compte = await depots.compte.lire(lu.data.compte);
  if (!compte || compte.archive_le) throw new ErreurChiffres("Compte inconnu.");
  await depots.compte.modifier(compte.code, { objectif_visibilite: lu.data.objectif === "" ? null : lu.data.objectif });
  await journaliser("chiffres", `Objectif de visibilité de ${compte.nom ?? compte.code} ${lu.data.objectif === "" ? "effacé" : "enregistré"}.`, { cible: `compte:${compte.code}` });
}

async function relevesDepuis(depuis: string): Promise<(LigneReleve & { mot: string; compte: string })[]> {
  return requete(
    `SELECT to_char(semaine, 'YYYY-MM-DD') AS semaine, mot, compte, commentaires, messages, demandes_guide, abonnes_gagnes
       FROM releve_mot WHERE archive_le IS NULL AND semaine >= $1::date ORDER BY semaine`,
    [depuis],
  );
}

/** Tout ce que l'écran montre pour la semaine `lundi` : mots, comptes, chiffres saisis, courbes et rapports. */
export async function vueDesChiffres(lundi: string) {
  const [mots, comptesTous] = await Promise.all([depots.mot.lister({ ordre: "ordre" }), depots.compte.lister({ ordre: "code" })]);
  const comptes = comptesTous.filter((c) => c.etat !== "retire");
  const comptesDesMots = comptes.filter((c) => (RESEAUX_DES_MOTS as readonly string[]).includes(c.reseau));
  const lignes = await relevesDepuis(ajouterJours(lundi, -7 * (SEMAINES_COURBE - 1)));
  const parMot = mots.map((m) => {
    const siennes = lignes.filter((l) => l.mot === m.code);
    const serie = serieDuMot(siennes, lundi);
    return { mot: m, serie, rapport: rapportDuMot(serie), saisis: siennes.filter((l) => l.semaine === lundi) };
  });
  return { mots: parMot, comptesDesMots, comptes };
}

export interface CarteChiffres {
  cle: string;
  titre: string;
  detail: string | null;
  bouton: string;
  lien: string;
  urgence: number;
}

/** Carte hebdomadaire « Relever les chiffres du mot » : tant que rien n'est saisi pour la semaine en cours. */
export async function cartesDesChiffres(): Promise<CarteChiffres[]> {
  if (!(await chiffresAllume()) || !(await interrupteurAllume(INTERRUPTEUR_CARTE_RELEVE))) return [];
  const lundi = lundiDe(await aujourdhuiParis());
  const [r] = await requete<{ mots: string; saisis: string }>(
    `SELECT (SELECT count(*) FROM mot WHERE archive_le IS NULL) AS mots,
            (SELECT count(*) FROM releve_mot WHERE archive_le IS NULL AND semaine = $1::date) AS saisis`,
    [lundi],
  );
  if (Number(r.mots) === 0 || Number(r.saisis) > 0) return [];
  return [
    {
      cle: "calcul:releve-mot",
      titre: "Relever les chiffres du mot",
      detail: "Notez cette semaine : commentaires au mot, messages partis, demandes de guide, abonnés gagnés.",
      bouton: "Relever",
      lien: "/chiffres",
      urgence: 45,
    },
  ];
}
