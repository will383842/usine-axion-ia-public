/** Écran « Mots en commentaire » (lecture seule) : regroupement par mot des chiffres reçus du CRM. Données fictives. */
import { describe, expect, it } from "vitest";
import { MOTS_CATALOGUE, vueParMot } from "@/agregats/vue";
import type { AgregatLu } from "@/agregats";
import { ecranParCode } from "@/components/gabarit/ecrans";

const l = (jour: string, mot: string, compte: string, v: Partial<AgregatLu> = {}): AgregatLu => ({
  jour, compte, mot, reseau: "facebook", demandes: 10, guides_envoyes: 8, accords: 5, mises_a_l_ecart: 3, genere_le: new Date("2026-11-01T00:00:00Z"), ...v,
});

describe("vue par mot", () => {
  it("liste tous les mots du catalogue, même sans chiffres, puis les mots reçus hors catalogue", () => {
    const vue = vueParMot([l("2026-11-01", "GUIDE", "page_principale"), l("2026-11-01", "AUTRE", "page_principale")]);
    expect(vue.map((m) => m.mot)).toEqual([...MOTS_CATALOGUE, "AUTRE"]);
    expect(vue.find((m) => m.mot === "TEMPS")!.recu).toBe(false);
    expect(vue.find((m) => m.mot === "GUIDE")!.recu).toBe(true);
  });
  it("additionne par mot et garde le détail par jour et par compte", () => {
    const [guide] = vueParMot([l("2026-11-01", "GUIDE", "a"), l("2026-11-02", "GUIDE", "a"), l("2026-11-02", "GUIDE", "b", { demandes: 4 })]);
    expect(guide.totaux.demandes).toEqual({ somme: 24, masquee: false });
    expect(guide.detail).toHaveLength(3);
    expect(guide.detail[0].jour >= guide.detail[2].jour).toBe(true);
  });
  it("une cellule masquée (null) n'est jamais comptée comme zéro : le total est marqué « au moins »", () => {
    const [guide] = vueParMot([l("2026-11-01", "GUIDE", "a", { accords: null }), l("2026-11-02", "GUIDE", "a")]);
    expect(guide.totaux.accords).toEqual({ somme: 5, masquee: true });
    expect(guide.detail.find((d) => d.jour === "2026-11-01")!.accords).toBeNull();
  });
});

describe("interrupteur de l'écran", () => {
  it("l'écran est allumable sous son propre code, sans écriture", () => {
    expect(ecranParCode("agregats.ecran")?.href).toBe("/mots?onglet=agregats");
  });
});
