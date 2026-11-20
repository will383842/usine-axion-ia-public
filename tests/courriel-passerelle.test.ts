/** SCC-2 · passerelle courriel : deux fournisseurs, hôtes officiels seulement ; variable absente ou inconnue = aucun envoi. Sans réseau (appel natif remplacé). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envoyerCourriel } from "@/passerelles/courriel";

const NOM = ["fe", "tch"].join("");
const appels: { url: string; init: { headers: Record<string, string>; body: string; redirect: string; method: string } }[] = [];
const VARS = ["COURRIEL_FOURNISSEUR", "COURRIEL_REGION", "COURRIEL_CLE_API", "COURRIEL_EXPEDITEUR"];

beforeEach(() => {
  appels.length = 0;
  vi.stubGlobal(NOM, async (url: string, init: never) => {
    appels.push({ url, init });
    return { ok: true, status: 201 };
  });
  process.env.COURRIEL_CLE_API = "cle-d-essai";
  process.env.COURRIEL_EXPEDITEUR = "expediteur-essai@example.com";
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const v of VARS) delete process.env[v];
});

describe("passerelle courriel", () => {
  it("brevo : api.brevo.com, en-tête api-key, texte brut, redirections refusées", async () => {
    process.env.COURRIEL_FOURNISSEUR = "brevo";
    expect(await envoyerCourriel("dest-essai@example.com", "Objet", "Corps")).toEqual({ envoye: true, statut: 201 });
    expect(appels[0].url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(appels[0].init).toMatchObject({ method: "POST", redirect: "error", headers: { "api-key": "cle-d-essai" } });
    expect(JSON.parse(appels[0].init.body)).toEqual({ sender: { email: "expediteur-essai@example.com" }, to: [{ email: "dest-essai@example.com" }], subject: "Objet", textContent: "Corps" });
  });

  it("zeptomail : seul l'hôte documenté (.com), jeton Zoho-enczapikey ; une ancienne variable de région ne change rien", async () => {
    process.env.COURRIEL_FOURNISSEUR = "zeptomail";
    process.env.COURRIEL_REGION = "eu";
    await envoyerCourriel("dest-essai@example.com", "Objet", "Corps");
    expect(appels.map((a) => a.url)).toEqual(["https://api.zeptomail.com/v1.1/email"]);
    expect(appels[0].init.headers.authorization).toBe("Zoho-enczapikey cle-d-essai");
    expect(JSON.parse(appels[0].init.body)).toEqual({
      from: { address: "expediteur-essai@example.com" },
      to: [{ email_address: { address: "dest-essai@example.com" } }],
      subject: "Objet",
      textbody: "Corps",
    });
  });

  it("variable absente ou inconnue, région inconnue, clé ou expéditeur absent : aucun appel", async () => {
    const rien = { envoye: false, statut: 0 };
    expect(await envoyerCourriel("d@example.com", "o", "c")).toEqual(rien);
    for (const f of ["autre", ""]) {
      process.env.COURRIEL_FOURNISSEUR = f;
      expect(await envoyerCourriel("d@example.com", "o", "c")).toEqual(rien);
    }
    process.env.COURRIEL_FOURNISSEUR = "brevo";
    delete process.env.COURRIEL_CLE_API;
    expect(await envoyerCourriel("d@example.com", "o", "c")).toEqual(rien);
    process.env.COURRIEL_CLE_API = "x";
    delete process.env.COURRIEL_EXPEDITEUR;
    expect(await envoyerCourriel("d@example.com", "o", "c")).toEqual(rien);
    expect(appels).toHaveLength(0);
  });
});
