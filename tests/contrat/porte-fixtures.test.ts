/**
 * Fixtures du contrat de la porte (v1) : jeu figé de JSON fictifs, relu par les schémas de `src/contrats/porte.ts`.
 * L'empreinte du jeu est recopiée telle quelle dans le Studio : si un fixture change, elle change, et ce test le dit.
 * Aucun appel réel, aucune base. Les secrets sont fictifs.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CODES_ERREUR_PORTE,
  demandeSujets,
  reponseRetenir,
  retenirSujet,
} from "@/contrats";
import { controlerAcces } from "@/porte/acces";
import { signature } from "@/tirage";

const DOSSIER = fileURLToPath(new URL("./fixtures/", import.meta.url));
const lire = <T>(nom: string): T => JSON.parse(readFileSync(DOSSIER + nom, "utf8")) as T;

/** Empreinte attendue du jeu, écrite en dur : la même que celle recopiée dans le Studio. */
const EMPREINTE_ATTENDUE = "c30cc5eb5a9707a092183b367c53723ab4fd669be4c0af8c2e147f79865acc89";

function empreinteDuJeu(): string {
  const h = createHash("sha256");
  for (const nom of readdirSync(DOSSIER).filter((n) => n.endsWith(".json")).sort()) {
    h.update(`${nom}\n${readFileSync(DOSSIER + nom, "utf8").replaceAll("\r\n", "\n")}\n`, "utf8");
  }
  return h.digest("hex");
}

const requete = (secret: string | null, env: Record<string, string | undefined>) =>
  controlerAcces({ headers: new Headers(secret === null ? {} : { authorization: `Bearer ${secret}` }) }, env);

describe("porte · fixtures", () => {
  it("l'empreinte sha256 du jeu est celle qui est recopiée dans le Studio", () => {
    expect(empreinteDuJeu()).toBe(EMPREINTE_ATTENDUE);
  });

  it("la demande valide passe le schéma ; la demande invalide (n à 0, champ inconnu) est refusée", () => {
    expect(demandeSujets.safeParse(lire("demande-sujets.json")).success).toBe(true);
    const r = demandeSujets.safeParse(lire("demande-sujets-invalide.json"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("le sujet à retenir passe le schéma et sa signature est celle de ses parts", () => {
    const s = retenirSujet.parse(lire("retenir-sujet.json"));
    expect(signature(s.parts)).toBe(s.signature);
    expect(retenirSujet.safeParse({ ...s, intrus: 1 }).success).toBe(false);
    expect(retenirSujet.safeParse({ ...s, reference_studio: "" }).success).toBe(false);
  });

  it("rejeu : le premier appel note le sujet (deja faux), le second le reconnaît (deja vrai) sans changer la signature", () => {
    const { appels } = lire<{ appels: unknown[] }>("rejeu-retenir.json");
    const [a, b] = appels.map((x) => reponseRetenir.parse(x));
    expect(appels).toHaveLength(2);
    expect(a.deja).toBe(false);
    expect(b.deja).toBe(true);
    expect(b.signature).toBe(a.signature);
    expect(a.signature).toBe(lire<{ signature: string }>("retenir-sujet.json").signature);
    // Un rejeu qui se présenterait comme neuf, ou une réponse sans « deja », est refusé.
    expect(reponseRetenir.safeParse({ signature: a.signature }).success).toBe(false);
  });

  it("secret périmé : refusé (401) alors que le courant est ouvert ; trop court : porte éteinte (404)", () => {
    const s = lire<{ courant: string; perime: string; trop_court: string; attendu: Record<string, string> }>("secrets.json");
    expect(s.perime).not.toBe(s.courant);
    const env = { USINE_PORTE_SECRET: s.courant };
    expect(requete(s.courant, env)).toBe(s.attendu.courant);
    expect(requete(s.perime, env)).toBe(s.attendu.perime);
    expect(requete(null, env)).toBe("refuse");
    expect(requete(s.courant, { USINE_PORTE_SECRET: s.trop_court })).toBe(s.attendu.trop_court);
    expect(requete(s.courant, {})).toBe("eteinte");
  });

  it("les codes d'erreur des fixtures sont ceux du contrat, sans doublon", () => {
    const { codes } = lire<{ codes: string[] }>("erreurs.json");
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...CODES_ERREUR_PORTE].sort());
  });
});
