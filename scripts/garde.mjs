#!/usr/bin/env node
/**
 * Garde de la CI :
 * 1. aucune suppression dans src/ et migrations/ (DELETE, TRUNCATE, DROP, deletePost) : retirer = archiver ;
 * 2. aucun secret ni adresse de vraie personne dans les fichiers suivis (exemples en @example.com seulement) ;
 * 3. aucun mot du lexique interdit (src/lib/lexique.ts) dans un texte d'écran (src/app, src/components, src/cartes) ;
 * 4. aucun mot privé (liste lue à l'exécution dans le fichier désigné par INTERDITS_PUBLIC_FICHIER, hors dépôt ; absente en CI = rouge) (L7-02) ;
 * 5. règle sortante, lue sur la syntaxe de TOUS les fichiers de code (essais, scripts et cette garde comprise), hors src/passerelles/ : ni fetch ni client réseau, ni Zernio ni Waalaxy (scripts/garde-sortante.mjs).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { motsInterditsDans } from "../src/lib/lexique.ts";
import { fautesSortantes, fautesTracesPrivees, preparerMotifsPrives } from "./garde-sortante.mjs";

const fichiers = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const SUPPRESSION = [
  /\b(DELETE|TRUNCATE|DROP)\b/,
  /\bdelete\s+from\b/i,
  /\btruncate\s+(table\s+)?["\w]/i,
  /\bdrop\s+(table|column|index|schema|database|view|sequence|constraint|type|function|trigger|extension|owned|role)\b/i,
  /\bdeletePost\b/,
];

const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "clé privée"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "jeton GitHub"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, "jeton GitHub"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, "clé Anthropic"],
  [/\bsk-[A-Za-z0-9]{32,}/, "clé d'API"],
  [/\bAKIA[0-9A-Z]{16}\b/, "clé AWS"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "jeton Slack"],
  [/\$argon2id\$v=\d+\$[^\s"'`]+/, "hachage de mot de passe"],
  [/\bJGFyZ29uMmlk[A-Za-z0-9+/=]{20,}/, "hachage de mot de passe en base64"],
  [/postgres(?:ql)?:\/\/[^:\s/]+:([^@\s]+)@(?!(localhost|127\.0\.0\.1|postgres)[:/])/, "adresse de base avec mot de passe"],
  [/\b(SESSION_SECRET|NEXT_SERVER_ACTIONS_ENCRYPTION_KEY|USINE_PASSWORD_HASH_B64)\s*[=:]\s*["']?[A-Za-z0-9+/=_-]{16,}/, "valeur de variable secrète"],
];
const ADRESSE = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;
const ADRESSES_PERMISES = /@(example\.(com|org|net)|anthropic\.com|users\.noreply\.github\.com)$/i;

const BINAIRES = /\.(woff2?|png|jpe?g|gif|ico|webp|pdf)$/i;
const IGNORES = new Set(["pnpm-lock.yaml", "scripts/garde.mjs"]);

/** Texte d'écran = littéraux entre guillemets et texte entre balises JSX ; commentaires et imports ignorés. */
const ECRAN = /^src\/(app|components|cartes)\/.*\.tsx?$/;
const LEXIQUE_ET_SES_ESSAIS = /\.test\.tsx?$/;
function textesEcran(ligne) {
  const sansCommentaire = ligne.replace(/^\s*(\/\/|\*|\/\*).*$/, "").replace(/\s\/\/ .*$/, "");
  if (/^\s*(import|export)\b.*\bfrom\b/.test(sansCommentaire)) return [];
  const textes = [];
  for (const m of sansCommentaire.matchAll(/"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`/g)) textes.push(m[1] ?? m[2] ?? m[3]);
  for (const m of sansCommentaire.matchAll(/>([^<>{}]+)</g)) textes.push(m[1]);
  return textes;
}

const fautes = [];
const prives = preparerMotifsPrives(process.env.INTERDITS_PUBLIC_FICHIER, (c) => readFileSync(c, "utf8"), Boolean(process.env.CI));
fautes.push(...prives.fautes);
if (prives.note) console.warn(`Garde : ${prives.note}.`);
for (const f of fichiers) {
  if (BINAIRES.test(f)) continue;
  let texte;
  try {
    texte = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  fautes.push(...fautesTracesPrivees(f, texte, prives.motifs));
  fautes.push(...fautesSortantes(f, texte));
  if (IGNORES.has(f)) continue;
  const lignes = texte.split("\n");
  const codeOuMigration = /^(src|migrations)\//.test(f);
  lignes.forEach((ligne, i) => {
    const ou = `${f}:${i + 1}`;
    if (codeOuMigration) for (const m of SUPPRESSION) if (m.test(ligne)) fautes.push(`${ou} : suppression interdite (retirer = archiver)`);
    if (ECRAN.test(f) && !LEXIQUE_ET_SES_ESSAIS.test(f)) for (const t of textesEcran(ligne)) for (const mot of motsInterditsDans(t)) fautes.push(`${ou} : mot interdit à l'écran (« ${mot} ») ; voir src/lib/lexique.ts`);
    for (const [m, nom] of SECRETS) if (m.test(ligne)) fautes.push(`${ou} : ${nom}`);
    for (const a of ligne.match(ADRESSE) ?? []) if (!ADRESSES_PERMISES.test(a) && !/^[^@]+@\d/.test(a)) fautes.push(`${ou} : adresse e-mail (${a}) ; utiliser @example.com`);
  });
}

if (fautes.length) {
  console.error(`Garde : ${fautes.length} problème(s).\n${fautes.join("\n")}`);
  process.exit(1);
}
console.log(`Garde : ${fichiers.length} fichiers relus, aucune suppression, aucun secret.`);
