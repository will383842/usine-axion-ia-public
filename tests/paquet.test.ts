/**
 * T10 · Le paquet à coller : limites ; chaque interdit de la base 8 ; nombre refusé ; mot non branché refusé.
 * Données fictives, sans base.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lireTables } from "@/import/lecteur";
import { controler, type ContexteControle, type InterditControle } from "@/lots/controle";
import { paquet, type FichePaquet, type LignePaquet } from "@/lots/paquet";
import { finPaquet, type Paquet, type Reseau } from "@/contrats";

// Les bases ne sont pas dans le dépôt public : sans elles, ces essais sont sautés.
const baseDisponible = existsSync("bases/8-voix-et-interdits.md");
const table = baseDisponible ? lireTables(readFileSync("bases/8-voix-et-interdits.md", "utf8")).find((t) => t.nom === "interdit")! : { entetes: [] as string[], lignes: [] as { valeurs: (string | null)[] }[] };
const INTERDITS: InterditControle[] = table.lignes.map((l) => {
  const v = Object.fromEntries(table.entetes.map((e, i) => [e, l.valeurs[i] ?? null]));
  return { code: v.code!, expression: v.expression, remplacement: v.remplacement, raison: v.raison, portee: v.portee };
});

function contexte(autres: Partial<ContexteControle> = {}): ContexteControle {
  return {
    interdits: INTERDITS,
    reseaux: ["instagram", "facebook"],
    comptes: [
      { code: "instagram:essai", reseau: "instagram", lien_profil: null },
      { code: "facebook:essai", reseau: "facebook", lien_profil: null },
    ],
    motsBranches: [
      { mot: "GUIDE", reseau: "instagram", compte: "" },
      { mot: "GUIDE", reseau: "facebook", compte: "" },
    ],
    public: "public.clients",
    ...autres,
  };
}

const SAIN: Paquet = {
  serie: "automatisations",
  sujet: "Les relances de devis qui ne partent jamais [usine:L1-1]",
  public: "Dirigeant · Artisan du bâtiment · Très petite entreprise",
  vraiCas: null,
  reseau: "fil",
  fin: { type: "diagnostic" },
  envoi: "Le diagnostic en ligne, en quelques minutes.",
};

const avecSujet = (texte: string): Paquet => ({ ...SAIN, sujet: `${texte} [usine:L1-1]` });

const ligne: LignePaquet = { id: "L12-3", service: "integration", reseaux: ["instagram", "facebook"], fins: { instagram: "fin-ig-mot", facebook: "fin-fb-mot" } };
const fiche = (autres: Partial<FichePaquet> = {}): FichePaquet => ({
  metier: { nom: "Expert-comptable" },
  taille: { nom: "Très petite entreprise" },
  douleur: { dite: "Vous écrivez la même relance, client après client. ".repeat(10) },
  cas: { titre: "La relance des pièces manquantes, client par client ".repeat(6), accroche: "Vous écrivez la même relance." },
  sujet: null,
  actualite: null,
  finsAuMot: ["fin-ig-mot", "fin-fb-mot"],
  mot: { mot: "GUIDE", cadeau: "Guide IA entreprise" },
  ...autres,
});

describe.skipIf(!baseDisponible)("paquet · limites", () => {
  it("aucun paquet ne dépasse une limite, le sujet finit par le repère", () => {
    for (const f of [fiche(), fiche({ cas: null, douleur: null }), fiche({ cas: { titre: "x".repeat(400), accroche: "y".repeat(400) } })]) {
      const p = paquet(ligne, f);
      expect(p.sujet.length).toBeLessThanOrEqual(160);
      expect(p.sujet).not.toContain("\n");
      expect(p.sujet.endsWith(" [usine:L12-3]")).toBe(true);
      expect(p.public.length).toBeLessThanOrEqual(200);
      expect(p.envoi.length).toBeLessThanOrEqual(300);
      expect(controler(p, contexte()).ok).toBe(true);
    }
  });

  it("un champ trop long est refusé avec sa raison", () => {
    const r = controler({ ...SAIN, public: "a".repeat(201) }, contexte());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refus[0].raison).toMatch(/dépasse 200 signes/);
    expect(controler({ ...SAIN, envoi: "a".repeat(301) }, contexte()).ok).toBe(false);
    expect(controler({ ...SAIN, sujet: "Sans repère" }, contexte()).ok).toBe(false);
  });

  it("fin au mot seulement sur Instagram et Facebook, réseau du studio selon les réseaux de la ligne", () => {
    expect(paquet(ligne, fiche()).fin).toEqual({ type: "commentaire", mot: "GUIDE" });
    const courts: LignePaquet = { ...ligne, reseaux: ["instagram", "tiktok"], fins: { ...ligne.fins, tiktok: "fin-tt-question" } };
    expect(paquet(courts, fiche())).toMatchObject({ reseau: "courts", fin: { type: "diagnostic" } });
    expect(paquet({ ...ligne, reseaux: ["linkedin"] }, fiche()).reseau).toBe("linkedin");
  });
});

/** Un texte qui tombe sous chaque interdit de la base 8 (et le contexte qui le rend interdit). */
const EXEMPLES: Record<string, { texte: string; ctx?: Partial<ContexteControle>; paquet?: Partial<Paquet> }> = {
  "interdit.ville": { texte: "Les artisans de Grenoble et leurs devis" },
  "interdit.cpf": { texte: "Une formation prise sur le CPF" },
  "interdit.gain-garanti": { texte: "Sans exclusivité, aucun gain garanti" },
  "interdit.chiffre": { texte: "Deux heures de relances chaque soir" },
  "interdit.cas-client": { texte: "Ce qu'a fait un de nos clients" },
  "interdit.prix": { texte: "Un audit à petit prix en euros" },
  "interdit.likez": { texte: "Likez si vous êtes d'accord" },
  "interdit.abonnement-condition": { texte: "Abonnez-vous pour recevoir le guide", ctx: { reseaux: ["facebook"] } },
  "interdit.mot-hors-reseau": { texte: "Écrivez GUIDE en commentaire", paquet: { reseau: "courts" } },
  "interdit.promesse-envoi": { texte: "Je vous l'envoie ce soir", paquet: { reseau: "linkedin" } },
  "interdit.apporteurs": { texte: "Devenez apporteur avec nous" },
  "interdit.pme-cac40": { texte: "De la PME au CAC 40" },
  "interdit.top": { texte: "Le top 1 % des dirigeants" },
  "interdit.promesse-gain": { texte: "Vous allez gagner vos soirées" },
  "interdit.remplacer": { texte: "Remplacer vos salariés par un outil" },
  "interdit.recrutement-revenu": { texte: "Un complément de revenu", ctx: { public: "public.apporteurs" } },
  "interdit.recrutement-facile": { texte: "Un rôle facile à tenir", ctx: { public: "public.apporteurs" } },
  "interdit.recrutement-qualiopi": { texte: "Un organisme Qualiopi", ctx: { public: "public.formateurs" } },
  "interdit.verification-apporteur": { texte: "Nous vérifions l'apporteur d'affaires", ctx: { public: "public.apporteurs" } },
  "interdit.marque-logiciel": { texte: "Vos devis dans Excel" },
  "interdit.accroche-creuse": { texte: "Savez-vous que vos devis attendent ?" },
};

describe.skipIf(!baseDisponible)("paquet · interdits de la base 8", () => {
  it("la base 8 a ses interdits, chacun a son exemple", () => {
    expect(INTERDITS.length).toBeGreaterThan(10);
    expect(INTERDITS.map((i) => i.code).sort()).toEqual(Object.keys(EXEMPLES).sort());
  });

  for (const i of INTERDITS) {
    it(`${i.code} est refusé avec sa raison`, () => {
      const e = EXEMPLES[i.code];
      const r = controler({ ...avecSujet(e.texte), ...e.paquet }, contexte(e.ctx));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      const refus = r.refus.find((x) => x.code === i.code);
      expect(refus, JSON.stringify(r.refus)).toBeDefined();
      expect(refus!.raison).toContain(i.raison!);
    });
  }

  it("le même texte sain passe", () => {
    expect(controler(SAIN, contexte())).toEqual({ ok: true, paquet: SAIN });
  });

  it("les interdits du recrutement ne valent pas pour le public Clients ; l'abonnement est une condition permise sur Instagram seul", () => {
    expect(controler(avecSujet("Une tâche facile à confier"), contexte()).ok).toBe(true);
    const ig = { ...avecSujet("Abonnez-vous pour recevoir le guide"), fin: { type: "commentaire" as const, mot: "GUIDE" } };
    expect(controler(ig, contexte({ reseaux: ["instagram"] })).ok).toBe(true);
  });
});

describe.skipIf(!baseDisponible)("paquet · garanti et garantie", () => {
  for (const texte of ["La garantie décennale de vos chantiers", "Relire les garanties du contrat", "La garantie responsabilité civile du cabinet", "La retenue de garantie du chantier"]) {
    it(`« ${texte} » passe (assurance)`, () => {
      expect(controler(avecSujet(texte), contexte()).ok).toBe(true);
      expect(controler(avecSujet(texte), contexte({ public: "public.apporteurs" })).ok).toBe(true);
    });
  }
  for (const texte of ["Un résultat garanti", "Un gain garanti", "Des devis garantis", "Satisfaction garantie"]) {
    it(`« ${texte} » est refusé`, () => {
      const r = controler(avecSujet(texte), contexte());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refus.some((x) => x.code === "interdit.promesse-gain")).toBe(true);
    });
  }
});

describe.skipIf(!baseDisponible)("paquet · nombres", () => {
  for (const texte of ["Les 3 relances du lundi", "Gagnez 30 % de temps", "Un devis à 1,5 jour", "Trois relances par jour", "Des centaines de mails", "Zéro oubli", "La moitié du temps", "Un quart d'heure", "Doublez vos réponses", "Triplez-les"]) {
    it(`« ${texte} » est refusé`, () => {
      const r = controler(avecSujet(texte), contexte());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refus.some((x) => x.code === "interdit.chiffre" && /table des faits est vide/.test(x.raison))).toBe(true);
    });
  }

  it("le repère n'est pas un nombre", () => {
    expect(controler({ ...SAIN, sujet: "Les relances [usine:L42-17]" }, contexte()).ok).toBe(true);
  });
});

describe.skipIf(!baseDisponible)("paquet · LinkedIn", () => {
  for (const reseaux of [["linkedin"], ["linkedin", "tiktok"]] as Reseau[][]) {
    it(`une ligne ${JSON.stringify(reseaux)} est refusée`, () => {
      const r = controler(SAIN, contexte({ reseaux }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refus.some((x) => x.champ === "fin" && /Commandez ce contenu sans LinkedIn/.test(x.raison))).toBe(true);
    });
  }
});

describe.skipIf(!baseDisponible)("paquet · public", () => {
  it("pas de préfixe Dirigeant devant un directeur, pas de « (cas général) »", () => {
    expect(paquet(ligne, fiche({ metier: { nom: "Directeur financier d'entreprise" } })).public).toMatch(/^Directeur financier/);
    expect(paquet(ligne, fiche({ metier: { nom: "Artisan (cas général)" } })).public).toMatch(/^Dirigeant · Artisan · /);
  });
});

describe.skipIf(!baseDisponible)("paquet · mot branché", () => {
  const auMot: Paquet = { ...SAIN, fin: { type: "commentaire", mot: "GUIDE" } };
  const nonBranche = (reseaux: Reseau[], motsBranches: ContexteControle["motsBranches"]) => controler(auMot, contexte({ reseaux, motsBranches }));

  it("mot branché sur chaque réseau : accepté", () => {
    expect(nonBranche(["instagram", "facebook"], contexte().motsBranches).ok).toBe(true);
  });

  it("mot non branché sur un des réseaux : refusé", () => {
    const r = nonBranche(["instagram", "facebook"], [{ mot: "GUIDE", reseau: "instagram", compte: "" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refus[0].raison).toMatch(/GUIDE n'est pas branché sur Facebook/);
    expect(nonBranche(["instagram"], []).ok).toBe(false);
  });

  it("mot branché sur un autre compte du réseau seulement : refusé", () => {
    const comptes = [...contexte().comptes, { code: "instagram:autre", reseau: "instagram" as const, lien_profil: null }];
    expect(controler(auMot, contexte({ reseaux: ["instagram"], comptes, motsBranches: [{ mot: "GUIDE", reseau: "instagram", compte: "essai" }] })).ok).toBe(false);
  });

  it("fin au mot hors d'Instagram et de Facebook : refusée", () => {
    expect(controler({ ...auMot, reseau: "courts" }, contexte({ reseaux: ["tiktok"] })).ok).toBe(false);
  });
});

describe.skipIf(!baseDisponible)("paquet · fin comme le studio", () => {
  // Recopié de `schemaDemandeScript` (studio-axion-ia, src/domaine/scripts-tableau.ts) : la fin n'est que « commentaire » ou « diagnostic ».
  const finStudio = z.discriminatedUnion("type", [
    z.object({ type: z.literal("commentaire"), mot: z.string().regex(/^[\p{L}\p{N}-]{2,20}$/u) }),
    z.object({ type: z.literal("diagnostic") }),
  ]);

  it("le paquet d'une ligne au mot passe la validation de fin du studio", () => {
    expect(finStudio.safeParse(paquet(ligne, fiche()).fin).success).toBe(true);
  });

  it("un mot qui n'a pas la forme du studio retombe sur le diagnostic", () => {
    for (const mot of ["A", "DEUX MOTS", "UN-MOT-BEAUCOUP-TROP-LONG"]) {
      const f = paquet(ligne, fiche({ mot: { mot, cadeau: null } })).fin;
      expect(f).toEqual({ type: "diagnostic" });
    }
  });

  it("un ancien paquet stocké avec le type « mot » est lu comme « commentaire »", () => {
    expect(finPaquet.parse({ type: "mot", mot: "GUIDE" })).toEqual({ type: "commentaire", mot: "GUIDE" });
  });
});
