/** UO-01 · coquille v3 : barre bleu ciel, thèmes, recherche Ctrl K, 12 états de contenu, filtres de liste. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { motsInterditsDans } from "@/lib/lexique";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("thèmes", () => {
  it("clair par défaut, deux thèmes, une valeur inconnue retombe sur clair", async () => {
    const { THEMES, THEME_DEFAUT, themeValide } = await import("@/lib/theme");
    expect(THEMES).toEqual(["clair", "sombre"]);
    expect(THEME_DEFAUT).toBe("clair");
    expect(themeValide("sombre")).toBe("sombre");
    expect(themeValide("rose")).toBe("clair");
    expect(themeValide(null)).toBe("clair");
  });
  it("lit et écrit le choix sans jamais lever d'erreur, même si le stockage est fermé", async () => {
    const { lireTheme, ecrireTheme } = await import("@/lib/theme");
    const memoire = new Map<string, string>();
    const stockage = { getItem: (k: string) => memoire.get(k) ?? null, setItem: (k: string, v: string) => void memoire.set(k, v) };
    expect(lireTheme(stockage)).toBe("clair");
    ecrireTheme("sombre", stockage);
    expect(lireTheme(stockage)).toBe("sombre");
    const ferme = {
      getItem: () => {
        throw new Error("fermé");
      },
      setItem: () => {
        throw new Error("fermé");
      },
    };
    expect(lireTheme(ferme)).toBe("clair");
    expect(() => ecrireTheme("sombre", ferme)).not.toThrow();
  });
});

describe("12 états d'un contenu", () => {
  it("douze états, dans l'ordre de la maquette, chacun avec mot, pictogramme, ton et phrase", async () => {
    const { ETATS_CONTENU, ORDRE_ETATS, etatContenu } = await import("@/lib/etats-contenu");
    expect(ORDRE_ETATS).toEqual(["brouillon", "script", "fabrication", "a-valider", "valide", "programme", "publie", "refuse", "echec", "annule", "archive", "corbeille"]);
    expect(ORDRE_ETATS).toHaveLength(12);
    for (const code of ORDRE_ETATS) {
      const e = etatContenu(code);
      expect(e.libelle.length).toBeGreaterThan(2);
      expect(e.phrase.length).toBeGreaterThan(10);
      expect(e.icone).toBeTruthy();
      expect(e.ton).toBeTruthy();
      expect(motsInterditsDans(`${e.libelle} ${e.phrase}`)).toEqual([]);
    }
    expect(new Set(ETATS_CONTENU.map((e) => e.libelle)).size).toBe(12);
  });
  it("« validé » se voit différent de « programmé » (un oui n'est pas une programmation)", async () => {
    const { etatContenu } = await import("@/lib/etats-contenu");
    expect(etatContenu("valide").libelle).not.toBe(etatContenu("programme").libelle);
    expect(etatContenu("valide").plein).toBe(false);
    expect(etatContenu("programme").plein).toBe(true);
  });
  it("un code inconnu retombe sur « brouillon »", async () => {
    const { etatContenu } = await import("@/lib/etats-contenu");
    expect(etatContenu("n-importe-quoi").code).toBe("brouillon");
  });
});

describe("filtres de liste", () => {
  const liste = [
    { id: "a", reseau: "instagram", type: "video" },
    { id: "b", reseau: "linkedin", type: "carrousel" },
    { id: "c", reseau: "instagram", type: "image" },
    { id: "d", reseau: "linkedin", type: "texte" },
  ];
  it("la famille se déduit du type du contrat : image et story sont des variantes de l'infographie, texte est hors famille", async () => {
    const { familleDeType } = await import("@/lib/filtres-liste");
    expect(familleDeType("video")).toBe("video");
    expect(familleDeType("carrousel")).toBe("carrousel");
    expect(familleDeType("image")).toBe("infographie");
    expect(familleDeType("story")).toBe("infographie");
    expect(familleDeType("texte")).toBe("hors-famille");
  });
  it("sans filtre tout passe ; les filtres se combinent (réseau ET famille)", async () => {
    const { filtrerListe, FILTRES_VIDES } = await import("@/lib/filtres-liste");
    expect(filtrerListe(liste, FILTRES_VIDES)).toHaveLength(4);
    expect(filtrerListe(liste, { reseau: "instagram", famille: null }).map((x) => x.id)).toEqual(["a", "c"]);
    expect(filtrerListe(liste, { reseau: "instagram", famille: "infographie" }).map((x) => x.id)).toEqual(["c"]);
    expect(filtrerListe(liste, { reseau: null, famille: "hors-famille" }).map((x) => x.id)).toEqual(["d"]);
  });
  it("lit et écrit les filtres dans l'adresse, en ignorant les valeurs inconnues", async () => {
    const { lireFiltres, versParametres } = await import("@/lib/filtres-liste");
    expect(lireFiltres(new URLSearchParams("reseau=tiktok&famille=video"))).toEqual({ reseau: "tiktok", famille: "video" });
    expect(lireFiltres(new URLSearchParams("reseau=myspace&famille=x"))).toEqual({ reseau: null, famille: null });
    expect(versParametres({ reseau: "linkedin", famille: null }).toString()).toBe("reseau=linkedin");
  });
});

describe("recherche Ctrl K", () => {
  it("trouve une page sans tenir compte des accents ni de la casse, et propose tout quand la saisie est vide", async () => {
    const { rechercher, ENTREES_RECHERCHE } = await import("@/components/gabarit/recherche");
    expect(rechercher("", ENTREES_RECHERCHE).length).toBe(ENTREES_RECHERCHE.length);
    expect(rechercher("JOURNEE", ENTREES_RECHERCHE)[0].href).toBe("/");
    expect(rechercher("calendrier", ENTREES_RECHERCHE).map((e) => e.href)).toContain("/calendrier");
    expect(rechercher("zzzzqq", ENTREES_RECHERCHE)).toEqual([]);
  });
  it("reconnaît Ctrl K et Cmd K, rien d'autre", async () => {
    const { estRaccourciRecherche } = await import("@/components/gabarit/recherche");
    expect(estRaccourciRecherche({ key: "k", ctrlKey: true, metaKey: false })).toBe(true);
    expect(estRaccourciRecherche({ key: "K", ctrlKey: false, metaKey: true })).toBe(true);
    expect(estRaccourciRecherche({ key: "k", ctrlKey: false, metaKey: false })).toBe(false);
    expect(estRaccourciRecherche({ key: "j", ctrlKey: true, metaKey: false })).toBe(false);
  });
});

describe("coquille : barre bleu ciel et branchements", () => {
  it("la barre de gauche est bleu ciel #a9d6f5, texte #071f33, pages claires", () => {
    const css = lire("src/app/globals.css");
    expect(css).toMatch(/--barre:\s*#a9d6f5/i);
    expect(css).toMatch(/--barre-texte:\s*#071f33/i);
    expect(css).toMatch(/data-theme="sombre"/);
  });
  it("le gabarit pose la barre latérale et la recherche ; les composants existent", () => {
    const g = lire("src/components/gabarit/Gabarit.tsx");
    expect(g).toContain("BarreLaterale");
    expect(g).toContain("RechercheCtrlK");
    expect(lire("src/components/gabarit/BarreLaterale.tsx")).toContain("bg-barre");
    expect(lire("src/components/ui/EtatContenu.tsx")).toContain("etatContenu");
    expect(lire("src/components/ui/FiltresListe.tsx")).toContain("filtres-liste");
  });
  it("les textes d'écran n'emploient aucun mot interdit", () => {
    for (const f of ["BarreLaterale", "RechercheCtrlK"]) {
      const texte = [...lire(`src/components/gabarit/${f}.tsx`).matchAll(/>\s*([^<>{}\n]{3,})\s*</g)].map((m) => m[1]).join(" ");
      expect(motsInterditsDans(texte)).toEqual([]);
    }
  });
});

describe("UO-01 · corrections de la relecture", () => {
  it("la Corbeille ne promet ni délai chiffré ni effacement tout seul", async () => {
    const { etatContenu } = await import("@/lib/etats-contenu");
    const phrase = etatContenu("corbeille").phrase;
    expect(phrase).not.toMatch(/\d/);
    expect(phrase).not.toMatch(/tout seul/);
    expect(phrase).toContain("confirmation écrite");
  });
  it("l'anneau de focus de la barre prend la couleur du texte de la barre (contraste ≥ 3:1 en sombre)", () => {
    const css = lire("src/app/globals.css");
    expect(css).toMatch(/aside :focus-visible[\s\S]*?outline-color:\s*var\(--barre-texte\)/);
    expect(lire("src/components/gabarit/BarreLaterale.tsx")).toContain("data-barre");
    expect(lire("src/components/gabarit/Gabarit.tsx")).toContain("data-barre");
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    expect(ratio("#071f33", "#a9d6f5")).toBeGreaterThanOrEqual(3);
    expect(ratio("#071f33", "#ffffff")).toBeGreaterThanOrEqual(3);
  });
  it("la recherche Ctrl K : piège de focus, page derrière inert, focus rendu, combobox/listbox/option", () => {
    const r = lire("src/components/gabarit/RechercheCtrlK.tsx");
    expect(r).toContain('e.key === "Tab"');
    expect(r).toContain(".inert = true");
    expect(r).toContain(".inert = false");
    expect(r).toContain("depart?.focus()");
    expect(r).toContain('role="combobox"');
    expect(r).toContain('role="listbox"');
    expect(r).toContain('role="option"');
    expect(r).toContain("aria-activedescendant");
    expect(r).toContain("aria-selected");
  });
});
