"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { depots, interrupteurAllume, journaliser } from "@/donnees";
import { exigerSession } from "@/services/auth";

const Code = z.string().regex(/^[a-z-]+:[a-z0-9._-]+$/);
const Ajout = z.object({
  reseau: z.enum(["linkedin", "instagram", "facebook", "tiktok", "youtube", "youtube-shorts"]),
  nom: z.string().trim().min(1).max(120),
  lien: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v)),
  note: z.string().trim().max(300),
});

const ouvert = () => interrupteurAllume("commenter.allume");

/** « Fait » : le compte est rangé pour aujourd'hui (fait_le), il reviendra plus tard dans la rotation. */
export async function compteFait(code: string): Promise<void> {
  await exigerSession();
  if (!(await ouvert())) return;
  const cle = Code.parse(code);
  const compte = await depots.compte_a_suivre.lire(cle);
  if (!compte || compte.archive_le || compte.fait_le) return;
  await depots.compte_a_suivre.modifier(cle, { fait_le: new Date() });
  await journaliser("commenter", `Commentaire fait chez ${compte.nom}`, { cible: `compte_a_suivre:${cle}` });
  revalidatePath("/commenter");
}

/** « Archiver » : le compte quitte la liste sans être supprimé. */
export async function compteArchive(code: string): Promise<void> {
  await exigerSession();
  if (!(await ouvert())) return;
  const cle = Code.parse(code);
  const compte = await depots.compte_a_suivre.archiver(cle);
  if (compte) await journaliser("commenter", `Compte archivé : ${compte.nom}`, { cible: `compte_a_suivre:${cle}` });
  revalidatePath("/commenter");
}

/** Ajoute un compte à la liste de Will (ou le remet dans la liste s'il avait été archivé). */
export async function compteAjoute(formulaire: FormData): Promise<void> {
  await exigerSession();
  if (!(await ouvert())) return;
  const lu = Ajout.safeParse({
    reseau: formulaire.get("reseau"),
    nom: formulaire.get("nom"),
    lien: formulaire.get("lien") ?? "",
    note: formulaire.get("note") ?? "",
  });
  if (!lu.success) return;
  const { reseau, nom, lien, note } = lu.data;
  const identifiant = nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^@/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!identifiant) return;
  const code = `${reseau}:${identifiant}`;
  await depots.compte_a_suivre.ecrire({ code, reseau, nom, lien: lien || null, note: note || null, archive_le: null });
  await journaliser("commenter", `Compte ajouté à la liste : ${nom}`, { cible: `compte_a_suivre:${code}` });
  revalidatePath("/commenter");
}
