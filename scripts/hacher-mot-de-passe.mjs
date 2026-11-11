#!/usr/bin/env node
/**
 * Fabrique la valeur de USINE_PASSWORD_HASH_B64 : le hachage argon2id du mot de passe, encodé en base64.
 * Usage : `pnpm hacher` (le mot de passe est saisi deux fois, sans s'afficher). Rien n'est écrit sur le disque.
 * La valeur affichée se colle dans les variables du serveur (/opt/usine-axion-ia), jamais dans le dépôt.
 */
import { hash } from "@node-rs/argon2";
import readline from "node:readline";

const REGLAGES = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };

function saisir(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (process.stdin.isTTY) {
      // Masque la saisie : seule la question s'affiche.
      rl._writeToOutput = (texte) => {
        if (texte.startsWith(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (reponse) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write("\n");
      resolve(reponse);
    });
  });
}

const motDePasse = await saisir("Mot de passe : ");
if (motDePasse.length < 12) {
  console.error("Choisissez 12 caractères au moins.");
  process.exit(1);
}
if (process.stdin.isTTY) {
  const encore = await saisir("Le même, encore une fois : ");
  if (encore !== motDePasse) {
    console.error("Les deux saisies diffèrent.");
    process.exit(1);
  }
}
const hachage = await hash(motDePasse, REGLAGES);
console.log("\nUSINE_PASSWORD_HASH_B64 :");
console.log(Buffer.from(hachage).toString("base64"));
