/** L0-03 · Garde des bases : la copie bases/ égale son témoin ; un écart la fait échouer (ADR 0001). */
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ecartsExternes, ecartsInternes, type TemoinBases } from "@/lib/bases-copie";

vi.mock("next/server", () => ({ connection: async () => {} }));

const racine = join(__dirname, "..");
// Les bases et leur témoin ne sont pas dans le dépôt public : sans eux, ces essais sont sautés.
const basesDisponibles = existsSync(join(racine, "bases")) && existsSync(join(racine, "bases.source.json"));
const temoin = (basesDisponibles ? JSON.parse(readFileSync(join(racine, "bases.source.json"), "utf8")) : {}) as TemoinBases;

function copie() {
  const dossier = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "bases-"));
  cpSync(join(racine, "bases"), dossier, { recursive: true });
  return dossier;
}

describe.skipIf(!basesDisponibles)("garde interne : la copie égale son témoin", () => {
  it("la copie du dépôt est conforme", () => {
    expect(ecartsInternes(join(racine, "bases"), temoin)).toEqual([]);
  });

  it("une ligne de 2-tailles.md changée à la main fait échouer", () => {
    const dossier = copie();
    const f = join(dossier, "2-tailles.md");
    writeFileSync(f, readFileSync(f, "utf8").replace(/^(.*)$/m, "$1 modifié"));
    expect(ecartsInternes(dossier, temoin)).toEqual(["modifié à la main : 2-tailles.md"]);
  });

  it("un fichier ajouté ou manquant fait échouer", () => {
    const dossier = copie();
    writeFileSync(join(dossier, "10-intrus.md"), "x");
    expect(ecartsInternes(dossier, temoin)).toContain("en trop : 10-intrus.md");
    const fausse: TemoinBases = { ...temoin, fichiers: { ...temoin.fichiers, "0-absent.md": "0".repeat(64) } };
    expect(ecartsInternes(join(racine, "bases"), fausse)).toContain("manquant : 0-absent.md");
  });

  it("une empreinte déclarée fausse fait échouer", () => {
    expect(ecartsInternes(join(racine, "bases"), { ...temoin, empreinte: "0".repeat(64) })).toEqual(["empreinte déclarée ≠ empreinte recalculée"]);
  });
});

describe.skipIf(!basesDisponibles)("garde externe : le témoin égale le manifeste de la source (manifeste simulé)", () => {
  it("identique : aucun écart", () => {
    expect(ecartsExternes(temoin, { commit: temoin.commit, fichiers: temoin.fichiers, empreinte: temoin.empreinte })).toEqual([]);
  });

  it("source avancée : écart par fichier", () => {
    const fichiers = { ...temoin.fichiers, "2-tailles.md": "f".repeat(64) };
    const ecarts = ecartsExternes(temoin, { commit: "autre", fichiers, empreinte: "e".repeat(64) });
    expect(ecarts).toContain("différent de la source : 2-tailles.md");
    expect(ecarts.length).toBe(2);
  });

  it("fichier ajouté ou retiré côté source", () => {
    const reste = Object.fromEntries(Object.entries(temoin.fichiers).filter(([nom]) => nom !== "9-accroches.md"));
    const ecarts = ecartsExternes(temoin, { commit: "x", fichiers: { ...reste, "10-nouveau.md": "a".repeat(64) }, empreinte: temoin.empreinte });
    expect(ecarts).toEqual(["absent de la copie : 10-nouveau.md", "absent de la source : 9-accroches.md"]);
  });
});

describe("/api/sante", () => {
  it("publie l'empreinte des bases embarquées", async () => {
    const { GET } = await import("@/app/api/sante/route");
    const corps = await (await GET()).json();
    expect(corps.bases).toEqual({ empreinte: temoin.empreinte, commit: temoin.commit });
  });
});
