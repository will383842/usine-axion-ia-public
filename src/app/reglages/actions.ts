"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CODES_SERVICE, CODES_TAILLE, RESEAUX } from "@/contrats";
import { depots, ecrireReglage, journaliser } from "@/donnees";
import {
  CLES,
  FORMATS_PART,
  verifierLienProfil,
  verifierParts,
  verifierPoids,
  verifierRythme,
  type Parts,
  type Rythme,
} from "@/reglages/modele";
import {
  CLE_QUOTAS,
  TYPES_QUOTA,
  verifierQuota,
  type PeriodeQuota,
  type QuotasParReseau,
} from "@/reglages/quotas";
import { exigerSession } from "@/services/auth";

function nombre(f: FormData, nom: string): number {
  const v = String(f.get(nom) ?? "").trim();
  return v === "" ? NaN : Number(v);
}

function retour(page: string, erreur: string | null): never {
  revalidatePath("/reglages", "layout");
  redirect(erreur ? `${page}?erreur=${encodeURIComponent(erreur)}` : `${page}?etat=enregistre`);
}

export async function enregistrerParts(f: FormData): Promise<void> {
  await exigerSession();
  const tout: Record<string, Parts> = {};
  for (const r of RESEAUX) {
    const parts = Object.fromEntries(FORMATS_PART.map((fo) => [fo, nombre(f, `${r}.${fo}`)])) as Parts;
    const erreur = verifierParts(parts);
    if (erreur) retour("/reglages/parts", `${r} : ${erreur}`);
    tout[r] = parts;
  }
  await ecrireReglage(CLES.parts, tout);
  await journaliser("reglage", "Parts de format par réseau enregistrées.", { cible: CLES.parts });
  retour("/reglages/parts", null);
}

export async function enregistrerRythmes(f: FormData): Promise<void> {
  await exigerSession();
  const tout: Record<string, Rythme> = {};
  for (const r of RESEAUX) {
    const rythme = { min: nombre(f, `${r}.min`), max: nombre(f, `${r}.max`) };
    const erreur = verifierRythme(rythme);
    if (erreur) retour("/reglages/rythmes", `${r} : ${erreur}`);
    tout[r] = rythme;
  }
  const actu = nombre(f, "actualites");
  if (!Number.isInteger(actu) || actu < 0 || actu > 7) retour("/reglages/rythmes", "Les actualités vont de 0 à 7 par semaine.");
  await ecrireReglage(CLES.rythmes, tout);
  await ecrireReglage(CLES.actualites, { par_semaine: actu });
  await journaliser("reglage", "Rythmes par réseau et rythme des actualités enregistrés.", { cible: CLES.rythmes });
  retour("/reglages/rythmes", null);
}

export async function enregistrerTirage(f: FormData): Promise<void> {
  await exigerSession();
  const taille = Object.fromEntries(CODES_TAILLE.map((c) => [c, nombre(f, `taille.${c}`)]));
  const service = Object.fromEntries(CODES_SERVICE.map((c) => [c, nombre(f, `service.${c}`)]));
  const erreur = verifierPoids(taille) ?? verifierPoids(service);
  if (erreur) retour("/reglages/tirage", erreur);
  const plafond = nombre(f, "plafond");
  if (!Number.isFinite(plafond) || plafond <= 0 || plafond > 10000) retour("/reglages/tirage", "Le plafond est un montant en euros supérieur à 0.");
  await ecrireReglage(CLES.poidsTaille, taille);
  await ecrireReglage(CLES.poidsService, service);
  await ecrireReglage(CLES.plafond, { eur: Math.round(plafond * 100) / 100 });
  await journaliser("reglage", "Poids du tirage et plafond par lot enregistrés.", { cible: CLES.plafond });
  retour("/reglages/tirage", null);
}

export async function enregistrerLiensProfil(f: FormData): Promise<void> {
  await exigerSession();
  const comptes = await depots.compte.lister();
  const changes: { code: string; lien: string | null }[] = [];
  for (const c of comptes) {
    const brut = String(f.get(`lien.${c.code}`) ?? "").trim();
    const erreur = verifierLienProfil(brut);
    if (erreur) retour("/reglages/comptes", `${c.nom ?? c.code} : ${erreur}`);
    if ((c.lien_profil ?? "") !== brut) changes.push({ code: c.code, lien: brut === "" ? null : brut });
  }
  for (const ch of changes) {
    await depots.compte.modifier(ch.code, { lien_profil: ch.lien });
    await journaliser("compte", `Lien du profil de ${ch.code} changé.`, { cible: ch.code });
  }
  retour("/reglages/comptes", null);
}


export async function enregistrerQuotas(f: FormData): Promise<void> {
  await exigerSession();
  const tout = {} as QuotasParReseau;
  for (const r of RESEAUX) {
    tout[r] = {} as QuotasParReseau[typeof r];
    for (const t of TYPES_QUOTA) {
      const periode = String(f.get(`${r}.${t}.periode`) ?? "") as PeriodeQuota;
      const quota = { periode, quantite: nombre(f, `${r}.${t}.quantite`) };
      const erreur = verifierQuota(quota);
      if (erreur) retour("/reglages/quotas", `${r} : ${erreur}`);
      tout[r][t] = quota;
    }
  }
  await ecrireReglage(CLE_QUOTAS, tout);
  await journaliser("reglage", "Quotas de production enregistrés.", { cible: CLE_QUOTAS });
  retour("/reglages/quotas", null);
}
