import { Annulable } from "@/components/Annulable";
import { depots, interrupteurAllume } from "@/donnees";
import { INTERRUPTEUR_MOTS } from "@/mots";
import { NATURES, NOMS_RESEAU, peutMettreEnService, relectureExigee, textesPretsPourBrancher } from "@/mots/regles";
import { EcranEteint } from "@/components/gabarit/EcranEteint";
import { ajouterLigneBranche, archiverTexte, changerBranchement, changerService, enregistrerAutomatisation, validerTexte } from "./actions";
import { Copier } from "./Copier";
import { ValiderApresRelecture } from "./ValiderTexte";

const jour = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** Onglet « Mots et messages » de « Mes mots et cadeaux » (la session est vérifiée par la page). */
export async function EcranMots() {
  if (!(await interrupteurAllume(INTERRUPTEUR_MOTS))) {
    return <EcranEteint code="mots" dansOnglet />;
  }
  const [mots, cadeaux, branches] = await Promise.all([
    depots.mot.lister({ ordre: "ordre" }),
    depots.cadeau.lister({ ordre: "nom" }),
    depots.mot_branche.lister(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">Mots et messages</h2>
        {mots.length === 0 ? <p className="font-semibold">Vous n&apos;avez pas encore de mot.</p> : null}
        <p className="text-texte-doux">Ici, rien ne part : les textes sont gardés, puis recopiés par vous dans l&apos;outil d&apos;envoi.</p>
      </div>

      {await Promise.all(
        mots.map(async (m) => {
          const textes = await depots.mot_texte.lister({ ou: { mot: m.code }, ordre: "reseau" });
          const groupes = new Map<string, typeof textes>();
          for (const t of textes) groupes.set(t.reseau, [...(groupes.get(t.reseau) ?? []), t]);
          const lignes = branches.filter((b) => b.mot === m.mot);
          return (
            <section key={m.code} className="flex flex-col gap-6">
              <h3 className="text-2xl font-bold">Mot {m.mot}</h3>
              <p className="text-texte-doux">Cadeau : {cadeaux.find((c) => c.code === m.cadeau)?.nom ?? "aucun"} · Outil d&apos;envoi : {m.outil}</p>

              <div className="flex flex-col gap-3">
                <h4 className="text-xl font-bold">Mot branché</h4>
                {lignes.length === 0 && <p className="text-texte-doux">Rien de branché.</p>}
                {lignes.map((b) => {
                  const pret = textesPretsPourBrancher(textes, b.reseau);
                  const branche = b.etat === "branche";
                  return (
                    <div key={b.id} className="flex flex-col gap-2 rounded-xl border border-trait bg-surface p-4">
                      <p className="font-bold">
                        {NOMS_RESEAU[b.reseau]} · {b.compte || "tous les comptes"}
                      </p>
                      <p>{branche ? `Branché depuis le ${jour(b.le)}` : `Pas branché (depuis le ${jour(b.le)})`}</p>
                      {branche || pret ? (
                        <form action={changerBranchement.bind(null, m.code, b.reseau, b.compte, !branche)}>
                          <button type="submit" className={branche ? "bouton-second" : "bouton"}>
                            {branche ? "Débrancher" : "Marquer comme branché"}
                          </button>
                        </form>
                      ) : (
                        <p className="text-texte-doux">Possible quand tous les textes de ce réseau sont validés.</p>
                      )}
                    </div>
                  );
                })}
                <form action={ajouterLigneBranche.bind(null, m.code)} className="flex flex-col gap-2 sm:flex-row">
                  <select name="cle" className="champ" aria-label="Réseau et compte" defaultValue="instagram">
                    <option value="instagram">Instagram · tous les comptes</option>
                    <option value="facebook">Facebook · tous les comptes</option>
                  </select>
                  <input name="compte" className="champ" placeholder="Compte (facultatif)" aria-label="Compte" />
                  <button type="submit" className="bouton-second">
                    Ajouter
                  </button>
                </form>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-xl font-bold">Identifiants d&apos;automatisation</h4>
                {Object.entries(m.automatisations).map(([cle, valeur]) => (
                  <p key={cle} className="break-all">
                    <span className="font-bold">{cle}</span> · {valeur}
                  </p>
                ))}
                <form action={enregistrerAutomatisation.bind(null, m.code)} className="flex flex-col gap-2">
                  <input name="cle" className="champ" defaultValue="instagram" aria-label="Réseau, ou réseau:compte" />
                  <input name="valeur" className="champ" placeholder="Identifiant (vide = retirer)" aria-label="Identifiant" />
                  <button type="submit" className="bouton">
                    Enregistrer
                  </button>
                </form>
              </div>

              <div className="flex flex-col gap-6">
                <h4 className="text-xl font-bold">Textes</h4>
                {[...groupes.entries()].map(([reseau, liste]) => (
                  <div key={reseau} className="flex flex-col gap-3">
                    <h5 className="text-lg font-bold">{NOMS_RESEAU[reseau] ?? reseau}</h5>
                    {liste.map((t) => (
                      <article key={t.id} className="flex flex-col gap-2 rounded-xl border border-trait bg-surface p-4">
                        <p className="font-bold">
                          {NATURES[t.nature] ?? t.nature}
                          {t.nature === "reponse_publique" ? ` n° ${t.rang}` : ""} · version {t.version}
                        </p>
                        <p>
                          {t.etat === "valide" ? `Validé le ${t.valide_le}` : "À valider"}
                          {t.en_service ? " · en service" : ""}
                        </p>
                        <p className="whitespace-pre-line break-words">{t.texte}</p>
                        <div className="flex flex-wrap gap-2">
                          <Copier texte={t.texte} />
                          {t.etat !== "valide" &&
                            (relectureExigee(t.nature) ? (
                              <ValiderApresRelecture texte={t.texte} action={validerTexte.bind(null, t.id, true)} />
                            ) : (
                              <Annulable libelle="Valider" message="Texte validé." action={validerTexte.bind(null, t.id, false)} className="bouton" />
                            ))}
                          {peutMettreEnService(t) && (
                            <form action={changerService.bind(null, t.id, !t.en_service)}>
                              <button type="submit" className="bouton-second">
                                {t.en_service ? "Sortir du service" : "Mettre en service"}
                              </button>
                            </form>
                          )}
                          <Annulable libelle="Archiver" message="Texte archivé." action={archiverTexte.bind(null, t.id)} />
                        </div>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          );
        }),
      )}
    </div>
  );
}

/** Onglet « Cadeaux » de « Mes mots et cadeaux » (la session est vérifiée par la page). */
export async function EcranCadeaux() {
  if (!(await interrupteurAllume(INTERRUPTEUR_MOTS))) {
    return <EcranEteint code="mots" dansOnglet />;
  }
  const [cadeaux, mots] = await Promise.all([depots.cadeau.lister({ ordre: "nom" }), depots.mot.lister({ ordre: "ordre" })]);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Cadeaux</h2>
      <p className="text-texte-doux">Le document promis à qui écrit votre mot en commentaire.</p>
      {cadeaux.length === 0 ? <p className="font-semibold">Vous n&apos;avez pas encore de cadeau.</p> : null}
      {cadeaux.map((c) => {
        const sesMots = mots.filter((m) => m.cadeau === c.code).map((m) => m.mot);
        return (
          <p key={c.code} className="rounded-xl border border-trait bg-surface p-4">
            <span className="font-bold">{c.nom}</span>
            {sesMots.length ? ` · mot ${sesMots.join(", ")}` : ""} · version {c.version ?? "—"} · {c.etat === "valide" ? `validé le ${c.valide_le}` : "à valider"}
          </p>
        );
      })}
    </section>
  );
}
