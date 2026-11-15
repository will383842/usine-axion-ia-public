import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ETATS_PUBLICATION_STUDIO, ETATS_VIDEO_STUDIO } from "@/contrats/echanges";
import { effetEchecFabrication } from "@/commandes/protection";

const MOTS_INTERDITS = /\b(job|pipeline|batch|prompt|token|workflow|persona|lead|crm|aimant|séquence)\b/i;
// Aucun nom de personne : pas de majuscule ailleurs qu'en début de phrase.
const MAJUSCULE_HORS_DEBUT = /(?<![.!?]\s)(?<!^)\p{Lu}/u;

describe("effetEchecFabrication", () => {
  it("fichier pur : aucun import de données, base ou passerelles", () => {
    const src = readFileSync("src/commandes/protection.ts", "utf8");
    const imports = src.split("\n").filter((l) => /^\s*(import|export .* from)\b/.test(l));
    for (const l of imports) {
      expect(l).not.toMatch(/donnees|lib\/base|passerelles|node:|\bpg\b/);
    }
  });

  it("parcourt chaque couple d'états", () => {
    for (const etatVideo of ETATS_VIDEO_STUDIO) {
      for (const etatPublication of [...ETATS_PUBLICATION_STUDIO, null] as const) {
        const programmeeLe = etatPublication === "programmee" ? "2026-12-01T09:00:00Z" : null;
        const r = effetEchecFabrication({ etatVideo, etatPublication, programmeeLe });
        expect(r.phrase).not.toMatch(MOTS_INTERDITS);
        expect(r.phrase).not.toMatch(MAJUSCULE_HORS_DEBUT);
        if (r.alerte) {
          expect(r.alerte).not.toMatch(MOTS_INTERDITS);
          expect(r.alerte).not.toMatch(MAJUSCULE_HORS_DEBUT);
        }
        if (etatPublication === "echec") expect(r.decision).toBe("a_regarder");
        else if (etatVideo === "echec" && (etatPublication === "programmee" || etatPublication === "publiee"))
          expect(r.decision).toBe("garder");
        else if (etatVideo === "echec") expect(r.decision).toBe("a_refaire");
        else expect(r.decision).toBe("rien");
        expect(["archiver", "effacer", "supprimer"]).not.toContain(r.decision);
      }
    }
  });

  it("garde une publication programmée ou publiée, date et état inchangés, avec une alerte", () => {
    for (const etatPublication of ["programmee", "publiee"] as const) {
      const r = effetEchecFabrication({ etatVideo: "echec", etatPublication, programmeeLe: "2026-12-01T09:00:00Z" });
      expect(r.decision).toBe("garder");
      expect(r.etatPublication).toBe(etatPublication);
      expect(r.programmeeLe).toBe("2026-12-01T09:00:00Z");
      expect(r.alerte).toMatch(/\S/);
      expect(r.alerte).toMatch(/échoué|échec|n'a pas abouti/i);
    }
  });

  it("refabrique avant toute programmation, sans archiver ni effacer", () => {
    for (const etatPublication of ["brouillon", null] as const) {
      const r = effetEchecFabrication({ etatVideo: "echec", etatPublication, programmeeLe: null });
      expect(r.decision).toBe("a_refaire");
      expect(r.phrase).toMatch(/\S/);
    }
  });

  it("une publication en échec ne relance rien d'elle-même", () => {
    const r = effetEchecFabrication({ etatVideo: "prete", etatPublication: "echec", programmeeLe: null });
    expect(r.decision).toBe("a_regarder");
  });
});
