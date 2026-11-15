import { Pastille } from "@/components/ui/Pastille";
import { etatContenu } from "@/lib/etats-contenu";

/** L'état d'un contenu, le même partout : couleur, pictogramme et mot. Plein quand c'est programmé ou publié, en pointillé sinon. */
export function EtatContenu({ code, detail }: { code: string; detail?: string }) {
  const e = etatContenu(code);
  return (
    <span title={e.phrase} className={e.plein ? "" : "rounded-full border border-dashed border-texte-doux/50"}>
      <Pastille ton={e.ton} icone={e.icone}>
        {e.libelle}
        {detail ? ` · ${detail}` : ""}
      </Pastille>
    </span>
  );
}
