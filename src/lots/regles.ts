/**
 * T09 · Règles d'un lot, sans accès à la base : bornes, plafond, états d'une ligne, taux de refus.
 * Le plafond saisi vaut accord de dépense du lot (PLAN-MAITRE C2) : le cumul des coûts maximum ne le dépasse jamais.
 */
import { z } from "zod";
import { codeRefus, codeVersion, etatLotLigne, reseau, type EtatLotLigne } from "@/contrats";

export const INTERRUPTEUR_LOTS = "lots";
export const NOMBRE_MIN = 3;
export const NOMBRE_MAX = 30;
/** Premier lot conseillé (C2 : 5 → 10 → 20 tant que les refus restent sous 30 %). */
export const NOMBRE_DEFAUT = 5;
/** Coût maximum d'un contenu, en euros (C2 : « 2 € au plafond »). */
export const COUT_MAX_LIGNE_DEFAUT_EUR = 2;
export const SEUIL_ALERTE_REFUS = 0.3;
export const FENETRE_REFUS_JOURS = 30;

export const LIBELLE_ETAT: Record<EtatLotLigne, string> = {
  a_coller: "À coller",
  collee: "Collée",
  fabriquee: "Fabriquée",
  publiee: "Publiée",
  refusee: "Refusée",
};

const montant = (message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v),
    z.number({ error: message }).finite(message).positive(message).max(10_000, message),
  );

/** Ce que Will saisit pour commander un lot. Le plafond est obligatoire. */
export const schemaCommande = z
  .object({
    nombre: z.coerce.number().int().min(NOMBRE_MIN, `De ${NOMBRE_MIN} à ${NOMBRE_MAX} contenus.`).max(NOMBRE_MAX, `De ${NOMBRE_MIN} à ${NOMBRE_MAX} contenus.`),
    plafondEur: montant("Le plafond en euros est obligatoire, supérieur à 0."),
    coutMaxLigneEur: montant("Le coût maximum par contenu est un montant en euros supérieur à 0."),
    reseaux: z.array(reseau).min(1, "Cochez au moins un réseau."),
    metiers: z.array(z.string().min(1)).optional(),
    poidsTailles: z.record(z.string(), z.number().int().min(0).max(100)),
    poidsServices: z.record(z.string(), z.number().int().min(0).max(100)),
    rythmeActualites: z.number().int().min(0).max(7),
  })
  .superRefine((c, ctx) => {
    const erreur = verifierPlafond(c.nombre, c.coutMaxLigneEur, c.plafondEur);
    if (erreur) ctx.addIssue({ code: "custom", message: erreur, path: ["plafondEur"] });
  });
export type Commande = z.infer<typeof schemaCommande>;

const centimes = (eur: number) => Math.round(eur * 100);

/** Le cumul des coûts maximum de `lignes` contenus tient-il sous le plafond ? Sinon, la phrase à afficher. */
export function verifierPlafond(lignes: number, coutMaxLigneEur: number, plafondEur: number | null | undefined): string | null {
  if (plafondEur === null || plafondEur === undefined || !Number.isFinite(plafondEur) || plafondEur <= 0) return "Le plafond en euros est obligatoire, supérieur à 0.";
  if (!Number.isFinite(coutMaxLigneEur) || coutMaxLigneEur < 0) return "Le coût maximum par contenu est un montant en euros.";
  const cumul = lignes * centimes(coutMaxLigneEur);
  if (cumul > centimes(plafondEur)) {
    const possibles = coutMaxLigneEur > 0 ? Math.floor(centimes(plafondEur) / centimes(coutMaxLigneEur)) : lignes;
    return `${lignes} contenus à ${euros(coutMaxLigneEur)} chacun font ${euros(cumul / 100)}, au-dessus du plafond de ${euros(plafondEur)} : montez le plafond ou commandez ${possibles} contenus au plus.`;
  }
  return null;
}

export function euros(n: number): string {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
}

/** Ce que Will change sur une ligne commandée : son état (et la raison d'un refus), le code de la vidéo. */
export const schemaLigne = z
  .object({
    etat: etatLotLigne,
    refus: codeRefus.nullable(),
    codeVersion: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .refine((v) => v === null || codeVersion.safeParse(v).success || /^cc-[a-z0-9]+(-[a-z0-9]+)*$/.test(v), "Le code de la vidéo a la forme 0042-TB ou cc-<cas>-<identifiant>."),
  })
  .superRefine((l, ctx) => {
    if (l.etat === "refusee" && !l.refus) ctx.addIssue({ code: "custom", message: "Choisissez la raison du refus.", path: ["refus"] });
  })
  .transform((l) => ({ ...l, refus: l.etat === "refusee" ? l.refus : null }));

/** Part des refus parmi les lignes déjà jugées (tout sauf « à coller »). Null : rien de jugé. */
export function tauxRefus(etats: readonly EtatLotLigne[]): number | null {
  const jugees = etats.filter((e) => e !== "a_coller");
  if (!jugees.length) return null;
  return jugees.filter((e) => e === "refusee").length / jugees.length;
}

export function alerteRefus(etats: readonly EtatLotLigne[]): string | null {
  const t = tauxRefus(etats);
  if (t === null || t <= SEUIL_ALERTE_REFUS) return null;
  return `Refus au-dessus de 30 % sur les ${FENETRE_REFUS_JOURS} derniers jours (${Math.round(t * 100)} %) : gardez des lots petits et regardez les raisons avant d'en commander un plus grand.`;
}
