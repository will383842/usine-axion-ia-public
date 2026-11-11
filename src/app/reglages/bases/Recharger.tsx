"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Annulable } from "@/components/Annulable";
import { recharger } from "./actions";

export function Recharger() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const agir = async () => {
    setEnCours(true);
    setMessage(null);
    const r = await recharger().catch(() => ({ ok: false as const, message: "Le serveur ne répond pas. Réessayez dans un instant." }));
    setEnCours(false);
    if (!r.ok) setMessage(r.message);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      {enCours ? (
        <p role="status" className="font-semibold">
          Rechargement en cours…
        </p>
      ) : (
        <Annulable libelle="Recharger les bases" message="Les bases vont être rechargées." action={agir} className="bouton" />
      )}
      {message && (
        <p role="alert" className="rounded-lg bg-terracotta-doux px-3 py-2 font-semibold text-terracotta-fonce">
          {message}
        </p>
      )}
    </div>
  );
}
