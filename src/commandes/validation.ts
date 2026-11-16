/** RC-17 · « À valider » : lire le contenu fini d'un créneau (appel 2 bis) et transmettre le geste du fondateur (appel 3). Un geste = un appel. */
import "server-only";
import { sousArret } from "@/arret";
import { COMPTE_USINE, aValiderStudio, corpsValidationStudio, erreurPorte, reponseValidationStudio, type AValiderStudio, type CorpsValidationStudio, type RefusCode } from "@/contrats";
import { interrupteurAllume, journaliser } from "@/donnees";
import { requete } from "@/lib/base";
import { appelerStudio } from "@/passerelles/studio";
import { INTERRUPTEUR_COMMANDES, PHRASE_ARRET, PHRASE_ETEINT, PHRASE_PAS_BRANCHE, PHRASE_SANS_REPONSE } from "./regles";

export const PHRASE_ARRET_LECTURE = "Tout est arrêté : rien n'est lu ni envoyé au Studio.";
export const PHRASE_LECTURE_ILLISIBLE = "Le Studio n'a pas rendu ce contenu de façon lisible : réessayez plus tard.";

type Appel = { genre: "reponse"; statut: number; corps: unknown } | { genre: "arret" } | { genre: "pas_branche" } | { genre: "sans_reponse" };

async function appeler(chemin: string, corps: unknown): Promise<Appel> {
  try {
    const r = await sousArret("commande", () => appelerStudio(chemin, corps));
    if (!r.fait) return { genre: "arret" };
    if (!r.valeur.envoye) return { genre: "pas_branche" };
    return { genre: "reponse", statut: r.valeur.statut, corps: r.valeur.corps };
  } catch {
    return { genre: "sans_reponse" };
  }
}

const phraseSansReponse = (r: Exclude<Appel, { genre: "reponse" }>, lecture: boolean) =>
  r.genre === "arret" ? (lecture ? PHRASE_ARRET_LECTURE : PHRASE_ARRET) : r.genre === "pas_branche" ? PHRASE_PAS_BRANCHE : PHRASE_SANS_REPONSE;

/* ----- règles pures ----- */

export interface GesteValidation {
  decision: "valide" | "refuse";
  empreinte: string;
  refus_code?: RefusCode;
  note?: string;
}

/** Corps strict de l'appel 3, ou refus local avec une phrase (aucun appel n'a lieu). */
export function corpsValidation(geste: GesteValidation, maintenant: Date): { ok: true; corps: CorpsValidationStudio } | { ok: false; phrase: string } {
  const note = geste.note?.replace(/\s+/g, " ").trim();
  const lu = corpsValidationStudio.safeParse({
    contrat: 2,
    etape: "video",
    decision: geste.decision,
    empreinte: geste.empreinte,
    valide_par: COMPTE_USINE,
    valide_le: maintenant.toISOString(),
    ...(geste.decision === "refuse" ? { refus_code: geste.refus_code, ...(note ? { note } : {}) } : {}),
  });
  return lu.success ? { ok: true, corps: lu.data } : { ok: false, phrase: "Ce geste n'est pas complet : relisez le contenu, puis réessayez." };
}

export type IssueValidation = { fait: true; deja: boolean; phrase: string } | { fait: false; perimee: boolean; phrase: string };

const PHRASES_ERREUR: Record<number, string> = {
  400: "Le Studio a refusé ce geste : relisez le contenu, puis réessayez.",
  401: "Le Studio n'a pas reconnu l'Usine : la clé d'échange est à revoir sur le serveur.",
  404: "Le Studio ne trouve plus ce contenu.",
  423: "Le Studio est à l'arrêt.",
  426: "Le Studio attend une version plus récente de l'échange : rien n'est parti.",
  429: "Le Studio reçoit trop de demandes : réessayez dans une minute.",
};
const PHRASE_PERIMEE = "Ce contenu a changé dans le Studio depuis votre lecture : relisez-le avant de valider.";
const PHRASE_INCOMPATIBLE = "Ce contenu ne se valide plus d'ici : ouvrez-le dans le Studio.";
const PHRASE_PANNE = "Le Studio a eu un souci : réessayez plus tard.";
const PHRASE_INATTENDUE = "La réponse du Studio n'est pas comprise : rien n'est noté comme fait.";

/** Réponse de l'appel 3 → fait ou non, avec une phrase sans code ni détail technique. Le message `erreur` du Studio n'est jamais repris. */
export function lireReponseValidation(statut: number, corps: unknown, decision: "valide" | "refuse"): IssueValidation {
  const non = (phrase: string, perimee = false): IssueValidation => ({ fait: false, perimee, phrase });
  if (statut === 200) {
    const lu = reponseValidationStudio.safeParse(corps);
    if (!lu.success) return non(PHRASE_INATTENDUE);
    if ((decision === "valide") !== (lu.data.etat === "a_valider")) return non(PHRASE_INATTENDUE);
    return { fait: true, deja: lu.data.deja, phrase: decision === "valide" ? "Validé." : "Refusé." };
  }
  if (statut === 409) {
    const code = erreurPorte.safeParse(corps);
    if (code.success && code.data.code === "version_perimee") return non(PHRASE_PERIMEE, true);
    return non(PHRASE_INCOMPATIBLE);
  }
  return non(PHRASES_ERREUR[statut] ?? PHRASE_PANNE);
}

/* ----- appels ----- */

export type LectureAValider = { lisible: true; donnees: AValiderStudio } | { lisible: false; arret: boolean; phrase: string };

/** Appel 2 bis : lecture seule. Éteint, arrêté ou passerelle fermée : aucun appel (ou aucun envoi), une phrase. */
export async function lireAValider(cle: string): Promise<LectureAValider> {
  if (!(await interrupteurAllume(INTERRUPTEUR_COMMANDES))) return { lisible: false, arret: false, phrase: PHRASE_ETEINT };
  const r = await appeler(`usine/commandes/${cle}/a-valider`, { contrat: 2 });
  if (r.genre !== "reponse") return { lisible: false, arret: r.genre === "arret", phrase: phraseSansReponse(r, true) };
  if (r.statut === 404) return { lisible: false, arret: false, phrase: "Le Studio ne trouve plus ce contenu." };
  if (r.statut === 409) return { lisible: false, arret: false, phrase: PHRASE_INCOMPATIBLE };
  const lu = r.statut === 200 ? aValiderStudio.safeParse(r.corps) : null;
  if (!lu?.success) return { lisible: false, arret: false, phrase: r.statut === 200 ? PHRASE_LECTURE_ILLISIBLE : (PHRASES_ERREUR[r.statut] ?? PHRASE_PANNE) };
  return { lisible: true, donnees: lu.data };
}

export interface ResultatGeste {
  message: string;
  fait: boolean;
}

/** Appel 3 : UN appel pour UN geste. Jamais appelée hors de `src/app/a-valider/actions.ts`. */
export async function envoyerValidation(cle: string, geste: GesteValidation): Promise<ResultatGeste> {
  if (!(await interrupteurAllume(INTERRUPTEUR_COMMANDES))) return { message: PHRASE_ETEINT, fait: false };
  if (!/^[0-9a-f]{64}$/.test(cle)) return { message: "Ce contenu n'existe plus.", fait: false };
  const [ligne] = await requete<{ cle: string }>(`SELECT cle FROM commande_studio WHERE cle = $1 AND archive_le IS NULL`, [cle]);
  if (!ligne) return { message: "Ce contenu n'existe plus.", fait: false };
  const corps = corpsValidation(geste, new Date());
  if (!corps.ok) return { message: corps.phrase, fait: false };

  const r = await appeler(`usine/commandes/${cle}/validation`, corps.corps);
  const issue: IssueValidation = r.genre === "reponse" ? lireReponseValidation(r.statut, r.corps, geste.decision) : { fait: false, perimee: false, phrase: phraseSansReponse(r, false) };
  const code = r.genre === "reponse" ? r.statut : r.genre;

  if (issue.fait) {
    // Un second geste identique (« deja ») ne change rien chez nous : la première date est gardée.
    const lu = reponseValidationStudio.parse((r as Extract<Appel, { genre: "reponse" }>).corps);
    if (geste.decision === "valide") {
      await requete(
        `UPDATE commande_studio SET etat_studio = 'a_valider', valide_le = $2, message = NULL, modifie_le = now()
          WHERE cle = $1 AND valide_le IS NULL AND refuse_le IS NULL`,
        [cle, new Date(lu.valideeLe ?? corps.corps.valide_le)],
      );
    } else {
      await requete(
        `UPDATE commande_studio SET etat_studio = 'refusee', refuse_le = $2, message = NULL, modifie_le = now()
          WHERE cle = $1 AND valide_le IS NULL AND refuse_le IS NULL`,
        [cle, new Date(lu.refuseLe ?? corps.corps.valide_le)],
      );
    }
  } else {
    await requete(`UPDATE commande_studio SET message = $2, modifie_le = now() WHERE cle = $1 AND valide_le IS NULL AND refuse_le IS NULL`, [cle, issue.phrase]);
  }
  await journaliser("validation", issue.fait ? "Un contenu a reçu le geste du fondateur chez le Studio." : "Le geste du fondateur n'a pas pu être transmis au Studio.", {
    cible: cle,
    donnees: { decision: geste.decision, empreinte: geste.empreinte.slice(0, 12), code },
  });
  return { message: issue.phrase, fait: issue.fait };
}
