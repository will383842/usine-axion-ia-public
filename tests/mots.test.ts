/**
 * T04 · `motBranche` ; refus de TikTok, LinkedIn, YouTube ; un texte « à valider » jamais « en service ».
 * L0-04 · Premier message et message avec le lien : le serveur refuse une validation en un geste.
 */
import { describe, expect, it, vi } from "vitest";
import { decider, peutMettreEnService, reseauBranchable, textesPretsPourBrancher, type LigneBranche } from "@/mots/regles";

const modifier = vi.fn(async () => undefined);
vi.mock("@/services/auth", () => ({ exigerSession: async () => ({ jti: "essai", rc: false }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/donnees", () => ({
  interrupteurAllume: async () => true,
  journaliser: async () => undefined,
  depots: { mot_texte: { lire: async (id: string) => ({ id, nature: id, reseau: "tous", mot: "GUIDE", archive_le: null }), modifier } },
}));
const { validerTexte } = await import("@/app/mots/actions");

const ligne = (reseau: string, compte: string, etat: string): LigneBranche => ({ mot: "GUIDE", reseau, compte, etat, archive_le: null });

describe("motBranche", () => {
  it("rien de branché au départ", () => {
    expect(decider([ligne("instagram", "williamsjullin", "non_branche")], "GUIDE", "instagram:williamsjullin")).toBe(false);
    expect(decider([], "GUIDE", "instagram:williamsjullin")).toBe(false);
  });

  it("branché sur un compte, pas sur un autre", () => {
    const l = [ligne("instagram", "williamsjullin", "branche")];
    expect(decider(l, "GUIDE", "instagram:williamsjullin")).toBe(true);
    expect(decider(l, "GUIDE", "instagram:autre")).toBe(false);
    expect(decider(l, "GUIDE", "facebook:axion-ia.com")).toBe(false);
  });

  it("sans compte, la ligne vaut pour tout le réseau ; la ligne du compte l'emporte", () => {
    const l = [ligne("facebook", "", "branche"), ligne("instagram", "", "branche"), ligne("instagram", "williamsjullin", "non_branche")];
    expect(decider(l, "GUIDE", "facebook:axion-ia.com")).toBe(true);
    expect(decider(l, "GUIDE", "instagram:autre")).toBe(true);
    expect(decider(l, "GUIDE", "instagram:williamsjullin")).toBe(false);
  });

  it("refuse TikTok, LinkedIn, YouTube même avec une ligne branchée", () => {
    for (const reseau of ["tiktok", "linkedin", "youtube", "youtube-shorts"]) {
      expect(reseauBranchable(reseau)).toBe(false);
      expect(decider([ligne(reseau, "", "branche")], "GUIDE", `${reseau}:x`)).toBe(false);
    }
    expect(reseauBranchable("instagram")).toBe(true);
    expect(reseauBranchable("facebook")).toBe(true);
  });
});

describe("textes", () => {
  it("un texte « à valider » ne passe jamais en service", () => {
    expect(peutMettreEnService({ etat: "propose" })).toBe(false);
    expect(peutMettreEnService({ etat: "brouillon" })).toBe(false);
    expect(peutMettreEnService({ etat: "valide" })).toBe(true);
  });

  it("on ne branche un réseau que si ses textes sont tous validés", () => {
    const t = (reseau: string, etat: string) => ({ reseau, etat, archive_le: null });
    expect(textesPretsPourBrancher([t("instagram", "propose"), t("tous", "valide")], "instagram")).toBe(false);
    expect(textesPretsPourBrancher([t("facebook", "valide"), t("tous", "valide")], "facebook")).toBe(true);
    expect(textesPretsPourBrancher([t("tous", "valide")], "facebook")).toBe(false);
  });
});

describe("valider en deux gestes", () => {
  it("premier message et message avec le lien : refusés sans la relecture, acceptés après", async () => {
    for (const nature of ["premier_message", "message_lien"]) {
      modifier.mockClear();
      await expect(validerTexte(nature, false)).rejects.toThrow("Relisez ce texte en entier");
      expect(modifier).not.toHaveBeenCalled();
      await validerTexte(nature, true);
      expect(modifier).toHaveBeenCalledTimes(1);
    }
  });
});
