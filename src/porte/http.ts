/**
 * Enveloppe commune des routes de la porte : garde d'abord, puis lecture du corps (16 Ko au plus, JSON, zod strict),
 * réponses JSON jamais mises en cache. Le journal du serveur ne garde que la route, l'issue et le nombre de lignes :
 * jamais l'en-tête ni le corps.
 */
import "server-only";
import type { z } from "zod";
import { controlerAcces } from "./acces";

const TAILLE_MAX_CORPS = 16 * 1024;
const ENTETES = { "cache-control": "no-store" } as const;

/** Une erreur à rendre telle quelle au studio, avec son statut. */
export class ErreurPorte extends Error {
  constructor(
    readonly statut: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(corps: unknown, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: ENTETES });
}

function noter(route: string, issue: string) {
  console.info(`[porte] ${route} ${issue}`);
}

const trop_grand = () => new ErreurPorte(413, "corps_trop_grand", "Corps trop grand (16 Ko au plus).");

/** Lit le corps par morceaux et s'arrête dès que la limite est dépassée, même sans `content-length` (ou avec un faux). */
async function lireLimite(requete: Request): Promise<string> {
  if (!requete.body) return "";
  const lecteur = requete.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > TAILLE_MAX_CORPS) {
      await lecteur.cancel();
      throw trop_grand();
    }
    morceaux.push(value);
  }
  return Buffer.concat(morceaux).toString("utf8");
}

async function lireCorps<S extends z.ZodType>(requete: Request, schema: S): Promise<z.infer<S>> {
  if (!(requete.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new ErreurPorte(415, "type_invalide", "Le corps doit être en application/json.");
  }
  const annonce = Number(requete.headers.get("content-length"));
  if (annonce > TAILLE_MAX_CORPS) throw trop_grand();
  const texte = await lireLimite(requete);
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new ErreurPorte(400, "json_illisible", "Corps JSON illisible.");
  }
  const r = schema.safeParse(brut);
  if (!r.success) {
    // Seulement les chemins et les messages de zod : jamais les valeurs reçues.
    const champs = r.error.issues.map((i) => `${i.path.join(".") || "(corps)"} : ${i.message}`).slice(0, 10);
    throw new ErreurPorte(400, "demande_invalide", `Demande invalide. ${champs.join(" ; ")}`);
  }
  return r.data;
}

/** Garde, puis `traiter`. Porte éteinte : 404 ; en-tête absent ou faux : 401, sans autre détail. */
export async function routePorte(route: string, requete: Request, traiter: () => Promise<Response>): Promise<Response> {
  const acces = controlerAcces(requete);
  if (acces === "eteinte") return json({ erreur: "Introuvable." }, 404);
  if (acces === "refuse") {
    noter(route, "401");
    return json({ erreur: "Accès refusé." }, 401);
  }
  try {
    const reponse = await traiter();
    noter(route, String(reponse.status));
    return reponse;
  } catch (e) {
    if (e instanceof ErreurPorte) {
      noter(route, `${e.statut} ${e.code}`);
      return json({ erreur: e.message, code: e.code }, e.statut);
    }
    noter(route, "500");
    console.error("[porte]", route, e instanceof Error ? e.message : "erreur");
    return json({ erreur: "Erreur du serveur." }, 500);
  }
}

/** `routePorte` pour un POST dont le corps suit `schema`. */
export function postPorte<S extends z.ZodType>(route: string, schema: S, traiter: (corps: z.infer<S>) => Promise<Response>) {
  return (requete: Request) => routePorte(route, requete, async () => traiter(await lireCorps(requete, schema)));
}
