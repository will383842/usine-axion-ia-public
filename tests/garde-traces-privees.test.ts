/** L7-02 · La garde refuse tout fichier qui contient un mot privé ; les mots viennent d'un fichier fourni à l'exécution, jamais du code. */
import { describe, expect, it } from "vitest";
import { fautesTracesPrivees, motifsDepuisTexte, preparerMotifsPrives } from "../scripts/garde-sortante.mjs";

// Mot FICTIF : le vrai fichier de mots n'est jamais dans le dépôt (ni son contenu, ni une empreinte).
const LISTE = "# commentaire\n\nmot-fictif[-_ ]?secret\n";
const { motifs } = motifsDepuisTexte(LISTE);

describe("mots privés lus dans un fichier fourni", () => {
  it("refuse un fichier factice qui contient le mot, quel que soit le type de fichier", () => {
    for (const f of ["src/lib/a.ts", "README.md", "scripts/a.sh", "bases.source.json", "pnpm-lock.yaml"]) {
      expect(fautesTracesPrivees(f, `ligne 1\nvoir mot-fictif-secret/ici\n`, motifs).length, f).toBe(1);
    }
  });

  it("refuse aussi les variantes de casse et de séparateur, et dit fichier et ligne sans répéter le mot", () => {
    expect(fautesTracesPrivees("a.md", "MOT-FICTIF-SECRET", motifs)).toHaveLength(1);
    expect(fautesTracesPrivees("a.md", "mot fictif secret".replace(/ /g, "_").replace("mot_fictif", "mot-fictif"), motifs)).toHaveLength(1);
    const f = fautesTracesPrivees("a.md", "x\nmot-fictif-secret", motifs);
    expect(f[0]).toContain("a.md:2");
    expect(f[0].toLowerCase()).not.toContain("fictif");
  });

  it("laisse passer un fichier sans mot", () => {
    expect(fautesTracesPrivees("a.ts", "const jeton = process.env.PLANS_PRIVE_LECTURE;\n", motifs)).toEqual([]);
  });

  it("ignore commentaires et lignes vides de la liste, et refuse une expression illisible", () => {
    expect(motifs).toHaveLength(1);
    const r = motifsDepuisTexte("valide\n(ouverte\n");
    expect(r.motifs).toHaveLength(1);
    expect(r.fautes).toHaveLength(1);
  });
});

describe("fichier de mots absent, illisible ou vide", () => {
  const lire = (c: string) => {
    if (c === "/liste") return LISTE;
    if (c === "/vide") return "# rien\n";
    throw new Error("introuvable");
  };

  it("fichier fourni : les mots sont chargés, aucune faute ni note", () => {
    const r = preparerMotifsPrives("/liste", lire, true);
    expect(r.motifs).toHaveLength(1);
    expect(r.fautes).toEqual([]);
    expect(r.note).toBeNull();
  });

  it("absent hors CI : aucune faute, mais la garde le dit", () => {
    const r = preparerMotifsPrives(undefined, lire, false);
    expect(r.fautes).toEqual([]);
    expect(r.note).toMatch(/NON fait/);
  });

  it("absent en CI : rouge", () => {
    expect(preparerMotifsPrives(undefined, lire, true).fautes).toHaveLength(1);
    expect(preparerMotifsPrives("", lire, true).fautes).toHaveLength(1);
  });

  it("illisible ou vide : rouge, même hors CI", () => {
    expect(preparerMotifsPrives("/absent", lire, false).fautes).toHaveLength(1);
    expect(preparerMotifsPrives("/vide", lire, false).fautes).toHaveLength(1);
  });
});
