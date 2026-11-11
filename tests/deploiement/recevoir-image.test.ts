/** RC-23 · Le script de réception d'image et la ligne de clé attendue : lecture du texte seulement, rien n'est lancé. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const lire = (f: string) => readFileSync(join(process.cwd(), "deploiement", f), "utf8");
const sansCommentaires = (t: string) => t.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

describe("deploiement/recevoir-image.sh", () => {
  const src = lire("recevoir-image.sh");
  const code = sansCommentaires(src);

  it("est un script bash strict", () => {
    expect(src.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(code).toContain("set -euo pipefail");
  });

  it("ignore la commande envoyée par le client et ne lit que l'entrée standard", () => {
    expect(code).not.toMatch(/SSH_ORIGINAL_COMMAND/);
    expect(code).not.toMatch(/\beval\b|\bsource\b|\bbash -c\b|\bsh -c\b/);
    expect(code).toMatch(/docker load/);
  });

  it("n'accepte que l'étiquette ci-<sha complet> de l'image de l'Usine", () => {
    expect(code).toContain("usine-axion-ia:ci-[0-9a-f]{40}");
    expect(code).toMatch(/gzip -t|gunzip -t/);
  });

  it("borne la taille reçue et ne détruit rien", () => {
    expect(code).toMatch(/head -c/);
    expect(code).not.toMatch(/\brm -rf? \/|docker (system|volume|image) (prune|rm)|docker rmi|\bDROP\b|\bTRUNCATE\b|\bDELETE\b/);
  });

  it("ne contient ni secret ni hôte ni adresse", () => {
    expect(src).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY|ssh-(ed25519|rsa) AAAA|ghp_|github_pat_|password\s*=|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i);
  });
});

describe("deploiement/authorized_keys.exemple", () => {
  const src = lire("authorized_keys.exemple");
  const lignes = src.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));

  it("a une seule ligne, à commande forcée et sans aucune option qui ouvre un accès", () => {
    expect(lignes).toHaveLength(1);
    const l = lignes[0];
    expect(l).toMatch(/^command="[^"]*recevoir-image\.sh",/);
    for (const o of ["restrict", "no-port-forwarding", "no-agent-forwarding", "no-X11-forwarding", "no-pty", "no-user-rc"]) expect(l).toContain(o);
    expect(l).not.toMatch(/\bpermit|\bport-forwarding(?!,)|cert-authority/);
  });

  it("ne porte aucune vraie clé : marque à remplacer seulement", () => {
    expect(lignes[0]).toContain("CLE_PUBLIQUE_A_REMPLACER");
    expect(src).not.toMatch(/AAAA[0-9A-Za-z+/]{20,}/);
  });

  it("explique la rotation", () => {
    expect(src.toLowerCase()).toContain("rotation");
  });
});
