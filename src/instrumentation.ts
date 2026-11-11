/** Au démarrage du serveur : variables vérifiées, puis migrations jouées (src/lib/demarrage.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { demarrer } = await import("@/lib/demarrage");
  await demarrer();
}
