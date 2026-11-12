/**
 * Proxy (ex-middleware, Next 16) : protège TOUT sauf /connexion, /api/sante, la porte du studio et les fichiers statiques.
 * La route entrante des chiffres du CRM (/api/agregats-crm) est publique pour le proxy : elle renvoie elle-même 401 sans HMAC valide (src/agregats/).
 * Le proxy ne suffit pas : chaque action serveur et chaque page appelle aussi exigerSession().
 * N-26 : seule une session complète (mot de passe ET second code) passe ; une session partielle n'ouvre que /connexion.
 * La porte du studio (/api/porte/**) n'a pas de session : chacune de ses routes exige le secret partagé (src/porte/acces.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { sessionComplete } from "@/auth/session";
import { NOM_COOKIE_SESSION } from "@/lib/jeton-session";

const PUBLICS = [/^\/connexion\/?$/, /^\/api\/sante\/?$/, /^\/api\/porte\/(sujets|sujets\/retenir|sujets\/retenir-lot|metiers)\/?$/, /^\/api\/agregats-crm\/?$/];

export function estPublic(pathname: string): boolean {
  return PUBLICS.some((r) => r.test(pathname));
}

export async function proxy(requete: NextRequest) {
  const { pathname, search } = requete.nextUrl;
  if (estPublic(pathname)) return NextResponse.next();
  if (await sessionComplete(requete.cookies.get(NOM_COOKIE_SESSION)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erreur: "Connexion requise." }, { status: 401 });
  }
  const url = requete.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = pathname !== "/" ? `?suite=${encodeURIComponent(pathname + search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static/|_next/image|favicon\\.ico$|robots\\.txt$).*)"],
};
