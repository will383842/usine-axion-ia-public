#!/usr/bin/env node
/**
 * Garde externe des bases (ADR 0001 § 4b) : bases.source.json = manifeste actuel de la source des bases (branche main).
 * Jeton PLANS_PRIVE_LECTURE (lecture seule, ce seul dépôt), dépôt source PLANS_PRIVE_DEPOT (« propriétaire/nom ») et chemin du manifeste PLANS_PRIVE_MANIFESTE, tous lus dans l'environnement. Jeton absent, manifeste illisible ou écart = rouge, jamais vert par défaut.
 * Sur une PR sans accès aux secrets (fork) : saut affiché explicitement avec --pr-sans-secret, jamais compté comme un succès.
 */
import { readFileSync } from "node:fs";
import { ecartsExternes } from "../src/lib/bases-copie.ts";
import { lireManifesteSource } from "../src/passerelles/bases-source.ts";

const temoin = JSON.parse(readFileSync(new URL("../bases.source.json", import.meta.url), "utf8"));
const jeton = process.env.PLANS_PRIVE_LECTURE;
const depot = process.env.PLANS_PRIVE_DEPOT;
const cheminManifeste = process.env.PLANS_PRIVE_MANIFESTE;

if (!jeton) {
  if (process.argv.includes("--pr-sans-secret")) {
    console.log("::warning::Garde externe des bases NON exécutée (PR sans accès aux secrets). Ce n'est pas un succès.");
    process.exit(0);
  }
  console.error("Garde externe des bases : jeton PLANS_PRIVE_LECTURE absent. Rouge (jamais vert par défaut).");
  process.exit(1);
}

for (const [nom, valeur] of [["PLANS_PRIVE_DEPOT", depot], ["PLANS_PRIVE_MANIFESTE", cheminManifeste]]) {
  if (!valeur) {
    console.error(`Garde externe des bases : ${nom} absent. Rouge.`);
    process.exit(1);
  }
}

let manifeste;
try {
  manifeste = await lireManifesteSource(jeton, depot, cheminManifeste);
} catch (e) {
  console.error(`Garde externe des bases : manifeste de la source illisible (${e instanceof Error ? e.message : e}). Rouge.`);
  process.exit(1);
}

const ecarts = ecartsExternes(temoin, manifeste);
if (ecarts.length > 0) {
  console.error("Les bases ne sont plus à jour avec la source. Lancez scripts/synchroniser-bases.sh :");
  for (const e of ecarts) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`Bases conformes à la source (empreinte ${temoin.empreinte.slice(0, 12)}).`);
