/** Contrôle de santé (public) : le serveur répond ; l'état de la base est donné à titre indicatif. */
import { connection } from "next/server";
import { baseConfiguree, requete } from "@/lib/base";
import { empreinteBases } from "@/lib/empreinte-bases";

export async function GET() {
  await connection();
  let base: "absente" | "ok" | "injoignable" = "absente";
  if (baseConfiguree()) {
    try {
      await Promise.race([requete("SELECT 1"), new Promise((_, refus) => setTimeout(() => refus(new Error("délai")), 2000))]);
      base = "ok";
    } catch {
      base = "injoignable";
    }
  }
  return Response.json({ etat: "ok", base, bases: empreinteBases }, { headers: { "cache-control": "no-store" } });
}
