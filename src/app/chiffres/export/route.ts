/** UO-08 · GET /chiffres/export?mois=AAAA-MM : CSV en lecture seule. Éteint par défaut (interrupteur « chiffres »). */
import type { NextRequest } from "next/server";
import { chiffresAllume } from "@/chiffres";
import { csvDesChiffres, moisValide } from "@/export";
import { exigerSession } from "@/services/auth";

export const dynamic = "force-dynamic";

const texte = (corps: string, status: number) => new Response(corps, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(requete: NextRequest) {
  await exigerSession();
  const mois = requete.nextUrl.searchParams.get("mois");
  if (!moisValide(mois)) return texte("Le mois doit s'écrire AAAA-MM, par exemple 2026-10.", 400);
  if (!(await chiffresAllume())) return texte("Cet export est éteint : allumez-le dans Réglages › Interrupteurs.", 404);
  return new Response(await csvDesChiffres(mois), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="chiffres-${mois}.csv"`, "cache-control": "no-store" },
  });
}
