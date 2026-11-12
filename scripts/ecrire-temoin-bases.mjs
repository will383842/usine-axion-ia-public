#!/usr/bin/env node
/**
 * Écrit bases.source.json (témoin de la copie) à partir du dossier source. Appelé par synchroniser-bases.sh, jamais à la main.
 * Le témoin publié ne porte ni sha de commit ni nom de la source : « commit » vaut « non-publie » (L7-02). Aucun processus lancé.
 * Usage : node scripts/ecrire-temoin-bases.mjs <dossier source>
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { construireTemoin } from "../src/lib/bases-copie.ts";

const source = resolve(process.argv[2] ?? "");
const temoin = construireTemoin(source, "non-publie", "bases-source");
writeFileSync(new URL("../bases.source.json", import.meta.url), JSON.stringify(temoin, null, 2) + "\n");
console.log(`bases.source.json écrit (empreinte ${temoin.empreinte.slice(0, 12)}).`);
