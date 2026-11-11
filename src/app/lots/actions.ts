"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CODES_SERVICE, CODES_TAILLE, TYPES_CONTENU, idLot, idLotLigne, type TypeContenu } from "@/contrats";
import {
  ErreurLot,
  ajouterDejaFabrique,
  archiverBrouillon,
  changerLigne,
  commanderLot,
  remplacerLigne,
  retirerLigneApercu,
  schemaCommande,
  schemaLigne,
  tirerApercu,
} from "@/lots";
import { exigerSession } from "@/services/auth";

function texte(f: FormData, nom: string): string | null {
  const v = String(f.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

function nombre(f: FormData, nom: string): number {
  const v = texte(f, nom);
  return v === null ? NaN : Number(v.replace(",", "."));
}

function retour(page: string, erreur: string | null, etat?: string): never {
  revalidatePath("/lots", "layout");
  redirect(erreur ? `${page}?erreur=${encodeURIComponent(erreur)}` : `${page}${etat ? `?etat=${etat}` : ""}`);
}

/** Une ErreurLot devient le message de l'écran ; toute autre erreur remonte. */
async function essayer(fn: () => Promise<void>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof ErreurLot) return e.message;
    throw e;
  }
}

export async function preparerLot(f: FormData): Promise<void> {
  await exigerSession();
  const saisie = schemaCommande.safeParse({
    nombre: texte(f, "nombre"),
    plafondEur: texte(f, "plafond"),
    coutMaxLigneEur: texte(f, "cout"),
    reseaux: f.getAll("reseaux").map(String),
    metiers: f.getAll("metiers").map(String),
    poidsTailles: Object.fromEntries(CODES_TAILLE.map((c) => [c, nombre(f, `taille.${c}`)])),
    poidsServices: Object.fromEntries(CODES_SERVICE.map((c) => [c, nombre(f, `service.${c}`)])),
    rythmeActualites: nombre(f, "actualites"),
  });
  if (!saisie.success) retour("/lots/nouveau", saisie.error.issues[0]?.message ?? "Saisie à corriger.");
  let id = "";
  const erreur = await essayer(async () => {
    id = await tirerApercu(saisie.data);
  });
  if (erreur) retour("/lots/nouveau", erreur);
  retour(`/lots/${id}`, null);
}

export async function remplacer(id: string, rang: number): Promise<void> {
  await exigerSession();
  const lot = idLot.parse(id);
  retour(`/lots/${lot}`, await essayer(() => remplacerLigne(lot, rang)));
}

export async function retirerDeLApercu(id: string, rang: number): Promise<void> {
  await exigerSession();
  const lot = idLot.parse(id);
  retour(`/lots/${lot}`, await essayer(() => retirerLigneApercu(lot, rang)));
}

export async function commander(id: string): Promise<void> {
  await exigerSession();
  const lot = idLot.parse(id);
  retour(`/lots/${lot}`, await essayer(() => commanderLot(lot)), "commande");
}

export async function archiver(id: string): Promise<void> {
  await exigerSession();
  const lot = idLot.parse(id);
  const erreur = await essayer(() => archiverBrouillon(lot));
  retour(erreur ? `/lots/${lot}` : "/lots", erreur);
}

export async function enregistrerLigne(idLigne: string, f: FormData): Promise<void> {
  await exigerSession();
  const id = idLotLigne.parse(idLigne);
  const lot = id.slice(0, id.indexOf("-"));
  const saisie = schemaLigne.safeParse({ etat: texte(f, "etat"), refus: texte(f, "refus"), codeVersion: texte(f, "code") ?? "" });
  if (!saisie.success) retour(`/lots/${lot}`, `Ligne ${id} : ${saisie.error.issues[0]?.message ?? "saisie à corriger."}`);
  retour(`/lots/${lot}`, await essayer(() => changerLigne(id, saisie.data)), "enregistre");
}

export async function noterDejaFabrique(f: FormData): Promise<void> {
  await exigerSession();
  const metier = texte(f, "metier");
  const page = `/lots/deja-fabrique${metier ? `?metier=${encodeURIComponent(metier)}` : ""}`;
  const type = (texte(f, "type_contenu") ?? "video") as TypeContenu;
  const format = texte(f, "format");
  if (!metier || !format || !TYPES_CONTENU.includes(type)) retour(page, "Choisissez le métier et le format.");
  const fabriqueLe = texte(f, "fabrique_le");
  if (fabriqueLe && !/^\d{4}-\d{2}-\d{2}$/.test(fabriqueLe)) retour(page, "La date a la forme AAAA-MM-JJ.");
  const erreur = await essayer(async () => {
    await ajouterDejaFabrique({
      type_contenu: type,
      metier,
      taille: texte(f, "taille"),
      service: texte(f, "service"),
      cas_usage: texte(f, "cas_usage"),
      sujet: texte(f, "sujet"),
      format,
      structure: texte(f, "structure"),
      code_version: texte(f, "code_version"),
      fabrique_le: fabriqueLe,
      note: texte(f, "note"),
    });
  });
  revalidatePath("/lots", "layout");
  redirect(erreur ? `/lots/deja-fabrique?metier=${encodeURIComponent(metier)}&erreur=${encodeURIComponent(erreur)}` : `/lots/deja-fabrique?etat=enregistre`);
}
