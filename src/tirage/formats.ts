/**
 * L2-05 · Formats que le tirage peut proposer, lus depuis les lignes de la base 5 (`format_video`, `format_autre`).
 * Fonction pure : `chargerBases()` l'appelle, les essais aussi, sur la vraie base 5.
 * Une vidéo n'est en service que si les quatre conditions sont vraies : `statut = actif` (jamais `masque`,
 * `bientot`, `plus_tard` ni `reserve`), `en_lot = oui`, `etat = valide` (une ligne `propose` attend Will),
 * et son type de contenu dans `FORMATS_TIRAGE_EN_SERVICE`. Ainsi FA (`actif`, `propose`, `en_lot = non`) et
 * IV (`masque`) n'entrent jamais dans un lot.
 */
import type { LigneBase } from "@/donnees/types";
import { FORMATS_TIRAGE_EN_SERVICE, type FormatPart } from "@/reglages/modele";
import type { FormatTirage } from "./types";

export const STATUT_EN_SERVICE = "actif";

/** Formats sans vidéo que le tirage sait placer, et leur type de contenu. */
const FORMATS_AUTRES: Record<string, FormatTirage["type_contenu"]> = { carrousel: "carrousel", story: "story", post_texte_linkedin: "texte", image: "image" };

type Video = Pick<LigneBase<"format_video">, "code" | "statut" | "en_lot" | "etat">;
type Autre = Pick<LigneBase<"format_autre">, "code" | "etat_service" | "etat">;

export function formatsDuTirage(videos: readonly Video[], autres: readonly Autre[], enService: readonly FormatPart[] = FORMATS_TIRAGE_EN_SERVICE): FormatTirage[] {
  const typeEnService = (t: FormatTirage["type_contenu"]) => (enService as readonly string[]).includes(t);
  return [
    ...videos
      .filter((f) => f.etat !== "retire")
      .map((f) => ({ code: f.code, type_contenu: "video" as const, en_service: f.statut === STATUT_EN_SERVICE && f.en_lot === "oui" && f.etat === "valide" && typeEnService("video") })),
    ...autres
      .filter((f) => FORMATS_AUTRES[f.code] && f.etat !== "retire")
      .map((f) => ({ code: f.code, type_contenu: FORMATS_AUTRES[f.code], en_service: f.etat_service === "en_service" && typeEnService(FORMATS_AUTRES[f.code]) })),
  ];
}
