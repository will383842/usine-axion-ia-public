import { exigerSession } from "@/services/auth";

/** Écran pas encore construit : il arrive avec sa tâche, éteint par défaut. */
export async function EnAttente({ titre }: { titre: string }) {
  await exigerSession();
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold">{titre}</h1>
      <p className="text-texte-doux">Cet écran arrive bientôt.</p>
    </section>
  );
}
