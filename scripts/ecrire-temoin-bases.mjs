#!/usr/bin/env node
/**
 * Écrit bases.source.json (témoin de la copie) à partir du dossier source. Appelé par synchroniser-bases.sh, jamais à la main.
 * Usage : node scripts/ecrire-temoin-bases.mjs <dossier source>
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { construireTemoin } from "../src/lib/bases-copie.ts";

const source = resolve(process.argv[2] ?? "");
let commit = "inconnu";
try {
  commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  console.error("Commit de la source introuvable : « commit » vaut « inconnu » dans bases.source.json.");
}
const temoin = construireTemoin(source, commit);
writeFileSync(new URL("../bases.source.json", import.meta.url), JSON.stringify(temoin, null, 2) + "\n");
console.log(`bases.source.json écrit (empreinte ${temoin.empreinte.slice(0, 12)}, commit ${commit.slice(0, 8)}).`);
