/** RC-17 · écran « À valider » : lecture du contenu fini (appel 2 bis), geste du fondateur (appel 3). Aucun appel réel : la passerelle est une doublure. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPTE_USINE, REFUS_CODES } from "@/contrats";
import { corpsValidation, lireReponseValidation } from "@/commandes/validation";
import { MENU } from "@/components/gabarit/navigation";
import { ecranParCode } from "@/components/gabarit/ecrans";

const appelerStudio = vi.fn();
vi.mock("@/passerelles/studio", () => ({ appelerStudio: (...a: unknown[]) => appelerStudio(...a) }));
const exigerSession = vi.fn(async () => undefined);
vi.mock("@/services/auth", () => ({ exigerSession: () => exigerSession() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Fx = Record<string, { statut: number; corps: unknown }>;
const lire = (nom: string) => JSON.parse(readFileSync(`tests/fixtures/porte-v2/${nom}.json`, "utf8"));
const aValider = lire("a-valider") as Fx;
const valide = lire("validation-valide");
const refuse = lire("validation-refuse");
const erreurs = lire("validation-erreurs") as Fx;

const EMPREINTE = (aValider.a_valider.corps as { empreinte: string }).empreinte;
const MOTS_INTERDITS = /\b(CRM|lead|batch|job|prompt|token|jeton|contrat|workflow|persona|pipeline|aimant|séquence|HTTP|\d{3})\b/i;
const maintenant = new Date("2099-12-01T10:00:00.000Z");

describe("à valider · partie pure", () => {
  it("corps du geste « valider » : exactement les clés prévues, valeurs de la fixture", () => {
    const r = corpsValidation({ decision: "valide", empreinte: EMPREINTE }, maintenant);
    if (!r.ok) throw new Error("refus inattendu");
    expect(r.corps).toEqual(valide.corps);
    expect(Object.keys(r.corps).sort()).toEqual(["contrat", "decision", "empreinte", "etape", "valide_le", "valide_par"]);
    expect(r.corps.etape).toBe("video");
    expect(r.corps.valide_par).toBe(COMPTE_USINE);
  });

  it("corps du geste « refuser » : motif et note en plus, rien d'autre", () => {
    const r = corpsValidation({ decision: "refuse", empreinte: EMPREINTE, refus_code: "accroche_faible", note: "Accroche trop longue." }, maintenant);
    if (!r.ok) throw new Error("refus inattendu");
    expect(r.corps).toEqual(refuse.corps);
    const sansNote = corpsValidation({ decision: "refuse", empreinte: EMPREINTE, refus_code: "image" }, maintenant);
    if (!sansNote.ok) throw new Error("refus inattendu");
    expect(Object.keys(sansNote.corps)).not.toContain("note");
  });

  it("aucune clé ni valeur interdite, aucune adresse", () => {
    const r = corpsValidation({ decision: "refuse", empreinte: EMPREINTE, refus_code: "hors_cible", note: "Un mot." }, maintenant);
    if (!r.ok) throw new Error("refus inattendu");
    for (const [cle, valeur] of Object.entries(r.corps)) {
      if (cle === "valide_le") continue;
      expect(`${cle} ${valeur}`).not.toMatch(/statut|programm|publi|eur\b|cent|prix|zernio|buffer|@/i);
    }
  });

  it("refus local sans appel : empreinte mal formée, motif absent ou inconnu, note trop longue", () => {
    expect(corpsValidation({ decision: "valide", empreinte: "abc" }, maintenant).ok).toBe(false);
    expect(corpsValidation({ decision: "refuse", empreinte: EMPREINTE }, maintenant).ok).toBe(false);
    expect(corpsValidation({ decision: "refuse", empreinte: EMPREINTE, refus_code: "autre" as never }, maintenant).ok).toBe(false);
    expect(corpsValidation({ decision: "refuse", empreinte: EMPREINTE, refus_code: "image", note: "x".repeat(301) }, maintenant).ok).toBe(false);
    expect(REFUS_CODES).toHaveLength(6);
  });

  it("chaque réponse a sa phrase, sans code, sans mot interdit, sans le texte du Studio", () => {
    expect(lireReponseValidation(200, valide.faite.corps, "valide")).toEqual({ fait: true, deja: false, phrase: "Validé." });
    expect(lireReponseValidation(200, valide.deja.corps, "valide")).toEqual({ fait: true, deja: true, phrase: "Validé." });
    expect(lireReponseValidation(200, refuse.faite.corps, "refuse")).toEqual({ fait: true, deja: false, phrase: "Refusé." });
    expect(lireReponseValidation(200, refuse.deja.corps, "refuse")).toEqual({ fait: true, deja: true, phrase: "Refusé." });
    expect(lireReponseValidation(200, refuse.faite.corps, "valide").fait).toBe(false);

    const perimee = lireReponseValidation(409, erreurs.version_perimee.corps, "valide");
    expect(perimee).toEqual({ fait: false, perimee: true, phrase: "Ce contenu a changé dans le Studio depuis votre lecture : relisez-le avant de valider." });
    expect(lireReponseValidation(409, erreurs.etat_incompatible.corps, "valide").phrase).toBe("Ce contenu ne se valide plus d'ici : ouvrez-le dans le Studio.");
    expect(lireReponseValidation(423, erreurs.arret.corps, "valide").phrase).toBe("Le Studio est à l'arrêt.");
    expect(lireReponseValidation(404, erreurs.introuvable.corps, "valide").phrase).toBe("Le Studio ne trouve plus ce contenu.");

    const phrases = new Set<string>();
    for (const [nom, r] of Object.entries(erreurs)) {
      const issue = lireReponseValidation(r.statut, r.corps, "valide");
      expect(issue.fait).toBe(false);
      expect(issue.phrase).not.toMatch(MOTS_INTERDITS);
      const erreur = (r.corps as { erreur?: string } | null)?.erreur;
      if (erreur) expect(issue.phrase).not.toContain(erreur);
      phrases.add(issue.phrase);
    }
    expect(phrases.size).toBeGreaterThanOrEqual(9);
  });

  it("l'écran est allumable sous commandes.studio, une seule phrase, avec sa ligne de menu juste après « Ma journée »", () => {
    expect(ecranParCode("commandes.studio")?.href).toBe("/a-valider");
    expect(MENU[1]).toMatchObject({ href: "/a-valider", libelle: "À valider", codes: ["commandes.studio"] });
    expect(readFileSync("src/components/gabarit/ecrans.ts", "utf8").match(/"?commandes\.studio"?\s*:/g) ?? []).toHaveLength(0);
  });

  it("envoyerValidation n'est importée que par les actions de l'écran", () => {
    const tous: string[] = [];
    const parcourir = (dir: string) => {
      for (const nom of readdirSync(dir)) {
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|tsx)$/.test(nom)) tous.push(chemin);
      }
    };
    parcourir("src");
    const utilisateurs = tous.filter((f) => readFileSync(f, "utf8").includes("envoyerValidation"));
    expect(utilisateurs.sort()).toEqual(["src/app/a-valider/actions.ts", "src/commandes/validation.ts"]);
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("à valider · en base, avec une doublure du Studio", () => {
  const regler = (code: string, allume: boolean) => p.query("UPDATE interrupteur SET allume = $2 WHERE code = $1", [code, allume]);
  let compteur = 0;
  const nouvelleCommande = async (surcharge: { instant?: string; etat?: string; valide?: boolean } = {}) => {
    compteur += 1;
    await p.query(`INSERT INTO compte (code, reseau, identifiant, nature, nom) VALUES ('linkedin:compte-fictif-1', 'linkedin', 'compte-fictif-1', 'page', 'Compte fictif') ON CONFLICT DO NOTHING`);
    const l = await p.query(`INSERT INTO calendrier_ligne (reseau, compte, type_contenu, prevue_le) VALUES ('linkedin', 'linkedin:compte-fictif-1', 'video', $1) RETURNING id::text`, [
      surcharge.instant ?? "2099-12-10T08:30:00Z",
    ]);
    const cle = compteur.toString(16).padStart(64, "0");
    await p.query(
      `INSERT INTO commande_studio (cle, calendrier_ligne, reseau, compte, type_contenu, jour, instant, etat_envoi, etat_studio, valide_le)
       VALUES ($1, $2, 'linkedin', 'linkedin:compte-fictif-1', 'video', '2099-12-10', $3, 'envoyee', $4, $5)`,
      [cle, l.rows[0].id, surcharge.instant ?? "2099-12-10T08:30:00Z", surcharge.etat ?? "a_valider", surcharge.valide ? new Date("2099-12-01T10:00:00Z") : null],
    );
    return cle;
  };
  const ligne = async (cle: string) => (await p.query("SELECT * FROM commande_studio WHERE cle = $1", [cle])).rows[0];
  const appelsPar = (suffixe: string) => appelerStudio.mock.calls.filter((a) => String(a[0]).endsWith(suffixe));

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const { utiliserPool } = await import("@/lib/base");
    const { jouerMigrations } = await import("@/lib/migrations");
    utiliserPool(p);
    await jouerMigrations(p);
  });
  afterAll(async () => {
    await p?.end();
  });
  beforeEach(async () => {
    appelerStudio.mockReset();
    appelerStudio.mockImplementation(async (chemin: string) =>
      String(chemin).endsWith("/a-valider") ? { envoye: true, statut: 200, corps: aValider.a_valider.corps } : { envoye: true, statut: 200, corps: valide.faite.corps },
    );
    exigerSession.mockClear();
    await regler("commandes.studio", true);
    await regler("studio.sortant", true);
    await regler("arret.tout", false);
    await p.query("UPDATE commande_studio SET archive_le = now() WHERE archive_le IS NULL");
  });

  it("un rendu de la page fait des lectures (2 bis) et jamais d'appel 3 ; session exigée en premier", async () => {
    await nouvelleCommande();
    const Page = (await import("@/app/a-valider/page")).default;
    const html = renderToStaticMarkup(await Page());
    expect(exigerSession).toHaveBeenCalledTimes(1);
    expect(appelsPar("/validation")).toHaveLength(0);
    expect(appelsPar("/a-valider")).toHaveLength(1);
    expect(html).toContain("Texte fictif de publication.");
    expect(html).toContain("Valider");
  });

  it("sans session, la page et les actions s'arrêtent avant tout appel", async () => {
    exigerSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const Page = (await import("@/app/a-valider/page")).default;
    await expect(Page()).rejects.toThrow();
    const { validerAction, refuserAction } = await import("@/app/a-valider/actions");
    exigerSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(validerAction("0".repeat(64), EMPREINTE)).rejects.toThrow();
    exigerSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(refuserAction("0".repeat(64), EMPREINTE, "image", "")).rejects.toThrow();
    expect(appelerStudio).not.toHaveBeenCalled();
  });

  it("éteint : l'écran éteint, 0 appel", async () => {
    await nouvelleCommande();
    await regler("commandes.studio", false);
    const Page = (await import("@/app/a-valider/page")).default;
    const { EcranEteint } = await import("@/components/gabarit/EcranEteint");
    const element = (await Page()) as { type: unknown; props: { code: string } };
    expect(element.type).toBe(EcranEteint);
    expect(element.props.code).toBe("commandes.studio");
    const { validerAction } = await import("@/app/a-valider/actions");
    const cle = await nouvelleCommande();
    expect((await validerAction(cle, EMPREINTE)).message).toBe("Les échanges avec le Studio sont éteints.");
    expect(appelerStudio).not.toHaveBeenCalled();
  });

  it("« Tout arrêter » ou passerelle fermée : 0 appel réussi, phrase claire, lignes connues sans bouton", async () => {
    const cle = await nouvelleCommande();
    const { validerAction } = await import("@/app/a-valider/actions");
    const Page = (await import("@/app/a-valider/page")).default;
    await regler("arret.tout", true);
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Tout est arrêté : rien n&#x27;est lu ni envoyé au Studio.");
    expect(html).not.toContain(">Valider<");
    expect(appelerStudio).not.toHaveBeenCalled();
    expect((await validerAction(cle, EMPREINTE)).message).toBe("Tout est arrêté.");
    expect(appelerStudio).not.toHaveBeenCalled();
    await regler("arret.tout", false);
    appelerStudio.mockResolvedValue({ envoye: false });
    const r = await validerAction(cle, EMPREINTE);
    expect(r).toEqual({ message: "Le Studio n'est pas encore branché : rien n'est parti.", });
    expect((await ligne(cle)).valide_le).toBeNull();
  });

  it("un geste = un appel 3, avec l'empreinte lue ; la date et l'état sont notés ; un second geste identique ne change rien", async () => {
    const cle = await nouvelleCommande();
    const { validerAction } = await import("@/app/a-valider/actions");
    expect(await validerAction(cle, EMPREINTE)).toEqual({ message: "Validé." });
    expect(appelsPar("/validation")).toHaveLength(1);
    const [chemin, corps] = appelsPar("/validation")[0] as [string, Record<string, unknown>];
    expect(chemin).toBe(`usine/commandes/${cle}/validation`);
    expect(corps.empreinte).toBe(EMPREINTE);
    expect(corps.valide_par).toBe("compte-usine");
    const premiere = await ligne(cle);
    expect(premiere.valide_le.toISOString()).toBe("2099-12-01T10:00:00.000Z");
    expect(premiere.etat_studio).toBe("a_valider");

    appelerStudio.mockResolvedValue({ envoye: true, statut: 200, corps: { ...valide.deja.corps, valideeLe: "2099-12-02T10:00:00.000Z" } });
    expect((await validerAction(cle, EMPREINTE)).message).toBe("Validé.");
    expect(appelsPar("/validation")).toHaveLength(2);
    expect((await ligne(cle)).valide_le.toISOString()).toBe("2099-12-01T10:00:00.000Z");

    const html = renderToStaticMarkup(await (await import("@/app/a-valider/page")).default());
    expect(html).not.toContain(cle);
    expect(html).toContain("Rien à valider pour l&#x27;instant.");
  });

  it("refus : un appel, motif et note transmis, la date de refus est notée, jamais de texte au journal", async () => {
    const cle = await nouvelleCommande();
    appelerStudio.mockResolvedValue({ envoye: true, statut: 200, corps: refuse.faite.corps });
    const { refuserAction } = await import("@/app/a-valider/actions");
    expect(await refuserAction(cle, EMPREINTE, "accroche_faible", "Accroche trop longue.")).toEqual({ message: "Refusé." });
    expect(appelsPar("/validation")).toHaveLength(1);
    expect(appelerStudio.mock.calls[0][1]).toMatchObject({ decision: "refuse", refus_code: "accroche_faible", note: "Accroche trop longue." });
    const l = await ligne(cle);
    expect(l.refuse_le.toISOString()).toBe("2099-12-01T10:00:00.000Z");
    expect(l.etat_studio).toBe("refusee");
    const journal = JSON.stringify((await p.query("SELECT * FROM journal WHERE sujet = 'validation'")).rows);
    expect(journal).toContain(EMPREINTE.slice(0, 12));
    expect(journal).not.toContain("Accroche trop longue.");
    expect(journal).not.toContain(EMPREINTE);
  });

  it("empreinte périmée : phrase « relisez-le », état local inchangé, aucun nouvel envoi", async () => {
    const cle = await nouvelleCommande();
    appelerStudio.mockResolvedValue({ envoye: true, statut: 409, corps: erreurs.version_perimee.corps });
    const { validerAction } = await import("@/app/a-valider/actions");
    const r = await validerAction(cle, EMPREINTE);
    expect(r.message).toMatch(/relisez-le/);
    expect(appelsPar("/validation")).toHaveLength(1);
    const l = await ligne(cle);
    expect(l.valide_le).toBeNull();
    expect(l.refuse_le).toBeNull();
    expect(l.message).toMatch(/relisez-le/);
  });

  it("entrées revérifiées : clé ou empreinte mal formée, motif inconnu → 0 appel", async () => {
    const { validerAction, refuserAction } = await import("@/app/a-valider/actions");
    const cle = await nouvelleCommande();
    await validerAction("pas-une-cle", EMPREINTE);
    await validerAction(cle, "pas-une-empreinte");
    await refuserAction(cle, EMPREINTE, "inconnu", "");
    await refuserAction(cle, EMPREINTE, "image", "x".repeat(301));
    await validerAction("f".repeat(64), EMPREINTE);
    expect(appelerStudio).not.toHaveBeenCalled();
  });

  it("média absent : pas de bouton « Valider » ; déjà validée : carte « Validée », pas de bouton ; texte rendu en clair", async () => {
    const Page = (await import("@/app/a-valider/page")).default;
    await nouvelleCommande({ instant: "2099-12-10T08:30:00Z" });
    appelerStudio.mockResolvedValue({ envoye: true, statut: 200, corps: aValider.sans_media.corps });
    let html = renderToStaticMarkup(await Page());
    expect(html).toContain("Rattachez la vidéo à cette date dans le Studio, puis revenez.");
    expect(html).not.toContain(">Valider<");

    appelerStudio.mockResolvedValue({ envoye: true, statut: 200, corps: aValider.deja_validee.corps });
    html = renderToStaticMarkup(await Page());
    expect(html).toContain("Validée.");
    expect(html).not.toContain(">Valider<");

    appelerStudio.mockResolvedValue({ envoye: true, statut: 200, corps: aValider.texte_piege.corps });
    html = renderToStaticMarkup(await Page());
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(");
    expect(html).toContain("/carrousels/c-fictif");
  });

  it("dix cartes au plus, triées par date ; les autres sont comptées", async () => {
    for (let i = 0; i < 12; i++) await nouvelleCommande({ instant: `2099-12-${String(10 + i).padStart(2, "0")}T08:30:00Z` });
    const Page = (await import("@/app/a-valider/page")).default;
    const html = renderToStaticMarkup(await Page());
    expect((html.match(/<article/g) ?? []).length).toBe(10);
    expect(html).toContain("2 autres attendent : validez celles-ci d&#x27;abord.");
  });

  it("état vide : phrase prévue et lien vers le calendrier", async () => {
    const Page = (await import("@/app/a-valider/page")).default;
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Rien à valider pour l&#x27;instant. Proposez une ligne du calendrier au Studio pour la voir ici.");
    expect(html).toContain('href="/calendrier"');
  });
});
