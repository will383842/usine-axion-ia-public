/**
 * Démarrage du serveur (appelé par src/instrumentation.ts, jamais à la construction de l'image) : vérifie les
 * variables obligatoires, puis joue les migrations `migrations/NNN-*.sql` qui ne l'ont pas encore été. Base injoignable :
 * 12 essais toutes les 5 s, puis arrêt (Docker relance le conteneur).
 * Ensuite, sans attendre : les bases se chargent seules si besoin (src/import/automatique.ts) ; rendu dans `bases`
 * (les essais l'attendent, le serveur non).
 */
export async function demarrer(): Promise<{ bases?: Promise<string> }> {
  const enProduction = process.env.NODE_ENV === "production";
  // USINE_PASSWORD_HASH_B64 est facultative : sans elle, le hachage vit dans le réglage `connexion.hachage`.
  const manquantes = ["DATABASE_URL", "SESSION_SECRET"].filter((v) => !process.env[v]);
  if (manquantes.length) {
    console.error(`[usine] variables absentes : ${manquantes.join(", ")}`);
    if (enProduction) process.exit(1);
  }
  if (!process.env.DATABASE_URL) return {};

  const { pool } = await import("./base");
  const { jouerMigrations } = await import("./migrations");
  for (let essai = 1; essai <= 12; essai++) {
    try {
      const r = await jouerMigrations(pool());
      console.log(`[usine] migrations : ${r.jouees.length} jouée(s), ${r.dejaJouees.length} déjà jouée(s).`);
      if (r.modifiees.length) console.error(`[usine] migrations modifiées après avoir été jouées : ${r.modifiees.join(", ")}`);
      return { bases: chargerLesBases() };
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      // Une migration refusée ne s'arrange pas en réessayant : arrêt immédiat.
      if (message.startsWith("Migration ")) {
        console.error(`[usine] ${message}`);
        process.exit(1);
      }
      console.error(`[usine] base injoignable (essai ${essai}/12) : ${message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.error("[usine] base toujours injoignable après 1 minute : arrêt.");
  process.exit(1);
}

/** Les bases se chargent seules (base vide ou fichiers changés) ; une erreur est journalisée, jamais levée. */
async function chargerLesBases(): Promise<string> {
  try {
    const { importerSiBesoin } = await import("@/import/automatique");
    const r = await importerSiBesoin();
    console.log(`[usine] bases : ${r === "importees" ? "chargées" : r === "inchangees" ? "inchangées" : "erreur, voir Réglages"}.`);
    return r;
  } catch (erreur) {
    console.error(`[usine] chargement automatique des bases impossible : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    return "erreur";
  }
}
