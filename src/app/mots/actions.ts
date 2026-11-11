"use server";

import { revalidatePath } from "next/cache";
import { depots, interrupteurAllume, journaliser } from "@/donnees";
import { INTERRUPTEUR_MOTS } from "@/mots";
import { peutMettreEnService, relectureExigee, reseauBranchable, textesPretsPourBrancher } from "@/mots/regles";
import { exigerSession } from "@/services/auth";

async function entrer() {
  await exigerSession();
  if (!(await interrupteurAllume(INTERRUPTEUR_MOTS))) throw new Error("L'écran Mots est éteint.");
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

async function texte(id: string) {
  const t = await depots.mot_texte.lire(id);
  if (!t || t.archive_le) throw new Error("Texte introuvable.");
  return t;
}

/**
 * Will valide un texte « à valider » : il devient « validé le… ». Premier message et message avec le lien :
 * seulement après la relecture du texte entier (`relu`, posé par « Je valide ce texte »).
 */
export async function validerTexte(id: string, relu: boolean): Promise<void> {
  await exigerSession();
  await entrer();
  const t = await texte(id);
  if (relectureExigee(t.nature) && !relu) throw new Error("Relisez ce texte en entier avant de le valider.");
  await depots.mot_texte.modifier(id, { etat: "valide", valide_le: aujourdhui() });
  await journaliser("mots", `Texte validé : ${t.nature} (${t.reseau}).`, { cible: t.mot, donnees: { id } });
  revalidatePath("/mots");
}

/** Mettre en service ou retirer du service. Un texte qui n'est pas validé n'entre jamais en service. */
export async function changerService(id: string, enService: boolean): Promise<void> {
  await exigerSession();
  await entrer();
  const t = await texte(id);
  if (enService && !peutMettreEnService(t)) throw new Error("Ce texte n'est pas validé : il ne peut pas être mis en service.");
  await depots.mot_texte.modifier(id, { en_service: enService });
  await journaliser("mots", `Texte ${enService ? "mis en service" : "sorti du service"} : ${t.nature} (${t.reseau}).`, { cible: t.mot, donnees: { id } });
  revalidatePath("/mots");
}

export async function archiverTexte(id: string): Promise<void> {
  await exigerSession();
  await entrer();
  const t = await texte(id);
  await depots.mot_texte.modifier(id, { en_service: false });
  await depots.mot_texte.archiver(id);
  await journaliser("mots", `Texte archivé : ${t.nature} (${t.reseau}).`, { cible: t.mot, donnees: { id } });
  revalidatePath("/mots");
}

/** Identifiant d'automatisation saisi à la main, par réseau (`instagram`) ou par compte (`instagram:williamsjullin`). Vide = retiré. */
export async function enregistrerAutomatisation(codeMot: string, formulaire: FormData): Promise<void> {
  await exigerSession();
  await entrer();
  const cle = String(formulaire.get("cle") ?? "").trim().toLowerCase();
  const valeur = String(formulaire.get("valeur") ?? "").trim().slice(0, 200);
  const [reseau, ...reste] = cle.split(":");
  if (!reseauBranchable(reseau) || reste.length > 1 || !/^[a-z0-9._-]*$/.test(reste[0] ?? "")) {
    throw new Error("Choisissez Instagram ou Facebook, avec le compte si besoin.");
  }
  const m = await depots.mot.lire(codeMot);
  if (!m || m.archive_le) throw new Error("Mot introuvable.");
  const suite = { ...m.automatisations };
  if (valeur) suite[cle] = valeur;
  else delete suite[cle];
  await depots.mot.modifier(codeMot, { automatisations: suite });
  await journaliser("mots", `Identifiant d'automatisation ${valeur ? "enregistré" : "retiré"} : ${cle}.`, { cible: codeMot });
  revalidatePath("/mots");
}

/** Change à la main l'indicateur « mot branché » (Instagram et Facebook seulement) ; journalisé. */
export async function changerBranchement(codeMot: string, reseau: string, compte: string, branche: boolean): Promise<void> {
  await exigerSession();
  await entrer();
  if (!reseauBranchable(reseau)) throw new Error("Seuls Instagram et Facebook peuvent être branchés.");
  const m = await depots.mot.lire(codeMot);
  if (!m || m.archive_le) throw new Error("Mot introuvable.");
  if (branche && !textesPretsPourBrancher(await depots.mot_texte.lister({ ou: { mot: codeMot } }), reseau)) {
    throw new Error("Les textes de ce réseau ne sont pas tous validés.");
  }
  const etat = branche ? "branche" : "non_branche";
  const [ligne] = await depots.mot_branche.lister({ ou: { mot: m.mot, reseau, compte }, inclureArchives: true });
  if (ligne) await depots.mot_branche.modifier(ligne.id, { etat, le: new Date(), archive_le: null });
  else await depots.mot_branche.ecrire({ mot: m.mot, reseau, compte, etat, le: new Date() });
  await journaliser("mots", `Mot ${m.mot} ${branche ? "branché" : "débranché"} : ${reseau}${compte ? ` · ${compte}` : " · tous les comptes"}.`, {
    cible: codeMot,
    donnees: { reseau, compte, etat },
  });
  revalidatePath("/mots");
}

/** Ajoute une ligne « pas branché » pour un réseau et un compte (vide = tous les comptes) ; ne touche pas une ligne existante. */
export async function ajouterLigneBranche(codeMot: string, formulaire: FormData): Promise<void> {
  await exigerSession();
  await entrer();
  const reseau = String(formulaire.get("cle") ?? "");
  const compte = String(formulaire.get("compte") ?? "").trim().toLowerCase();
  if (!reseauBranchable(reseau)) throw new Error("Seuls Instagram et Facebook peuvent être branchés.");
  if (!/^[a-z0-9._-]*$/.test(compte)) throw new Error("Compte : lettres minuscules, chiffres, point, tiret.");
  const m = await depots.mot.lire(codeMot);
  if (!m || m.archive_le) throw new Error("Mot introuvable.");
  const [existe] = await depots.mot_branche.lister({ ou: { mot: m.mot, reseau, compte }, inclureArchives: true });
  if (!existe) {
    await depots.mot_branche.ecrire({ mot: m.mot, reseau, compte, etat: "non_branche", le: new Date() });
    await journaliser("mots", `Ligne ajoutée : ${m.mot} · ${reseau} · ${compte || "tous les comptes"}, pas branché.`, { cible: codeMot });
  }
  revalidatePath("/mots");
}
