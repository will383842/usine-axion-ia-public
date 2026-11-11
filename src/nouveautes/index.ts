/** T13 · Nouveautés : proposées (à garder ou écarter), gardées (elles entrent au tirage), périmées jamais montrées. */
import "server-only";
import { depots, interrupteurAllume, journaliser } from "@/donnees";
import type { LigneBase } from "@/donnees";
import { requete } from "@/lib/base";
import { INTERRUPTEUR_NOUVEAUTES, empecheDeGarder, estPerimee } from "./regles";

export * from "./regles";

type Actualite = LigneBase<"actualite">;

export class ErreurNouveaute extends Error {}

export const nouveautesAllume = () => interrupteurAllume(INTERRUPTEUR_NOUVEAUTES);

export async function aujourdhuiParis(): Promise<string> {
  return (await requete<{ j: string }>(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS j`))[0].j;
}

async function exigerAllume() {
  if (!(await nouveautesAllume())) throw new ErreurNouveaute("L'écran Nouveautés est éteint : allumez-le dans Réglages › Interrupteurs.");
}

const parDate = (a: Actualite, b: Actualite) => (b.date_source ?? "").localeCompare(a.date_source ?? "") || a.code.localeCompare(b.code);

/** À garder ou écarter (pas encore décidées) et déjà gardées ; les périmées et les écartées ne sont jamais rendues. */
export async function lesNouveautes() {
  const jour = await aujourdhuiParis();
  const toutes = (await depots.actualite.lister()).filter((n) => !estPerimee(n.perime_le, jour));
  const retenue = (n: Actualite) => (n.retenue ?? "").trim();
  return {
    jour,
    proposees: toutes.filter((n) => n.etat === "propose" && retenue(n) === "").sort(parDate),
    gardees: toutes.filter((n) => retenue(n) === "oui").sort(parDate),
  };
}

/** Garder : la nouveauté entre au tirage suivant. Refusé sans source, ou si elle est périmée. */
export async function garderNouveaute(code: string): Promise<void> {
  await exigerAllume();
  const n = await depots.actualite.lire(code);
  if (!n || n.etat === "retire") throw new ErreurNouveaute("Nouveauté introuvable.");
  const raison = empecheDeGarder(n, await aujourdhuiParis());
  if (raison) throw new ErreurNouveaute(raison);
  await depots.actualite.modifier(code, { retenue: "oui", etat: "valide", valide_le: await aujourdhuiParis() });
  await journaliser("nouveautes", `Nouveauté gardée : ${n.titre ?? code}.`, { cible: `actualite:${code}` });
}

/** Écarter : la nouveauté n'est plus proposée (elle est archivée, jamais supprimée) et ne revient pas au tirage. */
export async function ecarterNouveaute(code: string): Promise<void> {
  await exigerAllume();
  const n = await depots.actualite.lire(code);
  if (!n || n.etat === "retire") return;
  await depots.actualite.modifier(code, { retenue: "non", etat: "retire" });
  await journaliser("nouveautes", `Nouveauté écartée : ${n.titre ?? code}.`, { cible: `actualite:${code}` });
}
