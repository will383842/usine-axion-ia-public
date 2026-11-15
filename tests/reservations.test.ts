/** UO-07 · Lecture des réservations du site, avec une doublure : seulement des nombres ; une donnée de personne rejette la réponse ; éteint ou injoignable : jamais zéro. */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { utiliserPool } from "@/lib/base";
import { jouerMigrations } from "@/lib/migrations";
import { lireReservationsDuSite, type AppelSite } from "@/reservations/lecteur";

const bonne = { reservations: [{ lien: "lien-essai", semaine: "2026-10-12", nombre: 3 }] };
const doublure = (statut: number, corps: unknown): AppelSite => async () => ({ statut, corps });

describe("réservations · lecteur", () => {
  it("lit les nombres par lien et par semaine, jeton en en-tête", async () => {
    const appel = vi.fn(doublure(200, bonne));
    expect(await lireReservationsDuSite(appel, "jeton-fictif")).toEqual({ etat: "ok", lignes: bonne.reservations });
    expect(appel).toHaveBeenCalledWith({ entetes: { authorization: "Bearer jeton-fictif" } });
  });

  it.each([["nom", { nom: "Exemple" }], ["email", { email: "a@example.com" }], ["telephone", { telephone: "0600000000" }]])("une réponse qui contient %s est rejetée", async (_c, extra) => {
    const corps = { reservations: [{ ...bonne.reservations[0], ...extra }] };
    expect(await lireReservationsDuSite(doublure(200, corps), "jeton-fictif")).toEqual({ etat: "pas-de-donnee" });
    expect(await lireReservationsDuSite(doublure(200, { ...bonne, ...extra }), "jeton-fictif")).toEqual({ etat: "pas-de-donnee" });
  });

  it("401, site injoignable, jeton ou appel absent : pas de donnée, jamais zéro", async () => {
    expect(await lireReservationsDuSite(doublure(401, bonne), "jeton-fictif")).toEqual({ etat: "pas-de-donnee" });
    expect(await lireReservationsDuSite(async () => { throw new Error("injoignable"); }, "jeton-fictif")).toEqual({ etat: "pas-de-donnee" });
    expect(await lireReservationsDuSite(doublure(200, bonne), undefined)).toEqual({ etat: "pas-de-donnee" });
    expect(await lireReservationsDuSite(null, "jeton-fictif")).toEqual({ etat: "pas-de-donnee" });
  });
});

const url = process.env.DATABASE_URL;
const schema = `essai_${randomBytes(4).toString("hex")}`;
let p: Pool;

describe.skipIf(!url)("réservations · interrupteur", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    p = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    utiliserPool(p);
    await jouerMigrations(p);
  });
  afterAll(async () => {
    await p?.end();
  });

  it("éteint par défaut : aucun appel ; allumé : l'appel a lieu", async () => {
    vi.stubEnv("RESERVATIONS_JETON", "jeton-fictif");
    const { lireReservations } = await import("@/reservations");
    const appel = vi.fn(doublure(200, bonne));
    expect(await lireReservations(appel)).toEqual({ etat: "eteint" });
    expect(appel).not.toHaveBeenCalled();
    await p.query("UPDATE interrupteur SET allume = true WHERE code = 'reservations'");
    expect(await lireReservations(appel)).toMatchObject({ etat: "ok" });
    expect(appel).toHaveBeenCalledTimes(1);
  });
});
