# Relecture PR 13 (L7-21) · seconde passe Opus

**Verdict : OK. Fusion possible sur cette tête exacte : `4a7942c753a63aad2072e0fc3b7499dbddb48802` (branche `usine/L7-21`).**
Une tête différente demande une nouvelle relecture.

Point bloquant de la première relecture (`relectures/usine-13-opus.md` : ligne `image` de `format_autre` en service sans `etat = 'valide'`) : **corrigé**.

## 1. Correction en place
- `src/tirage/formats.ts` l. 30, branche `format_autre` : `en_service: f.etat_service === "en_service" && f.etat === "valide" && typeEnService(...)`.
- Branche vidéo (l. 26-27) identique octet pour octet à `origin/main` ; seul le commentaire d'en-tête a changé (nom de la constante, règle des autres formats).

## 2. Aucun autre chemin pour une ligne non validée
- Sonde jetable sur `formatsDuTirage` avec `etat_service = en_service` : `propose`, `brouillon`, `Valide`, `VALIDE`, ` valide`, `valide `, `undefined`, `null`, `""` → `en_service: false` ; `retire` → ligne écartée. Comparaison stricte, pas de normalisation de casse.
- Code `Image` / `IMAGE` : ligne écartée (clé sensible à la casse).
- Tous les consommateurs (`tirer.ts`, `lots/index.ts`, `porte/index.ts`, `charger.ts`) lisent `en_service` issu de `formatsDuTirage` ; aucun ne lit `format_autre.etat_service` directement. `app/lots/deja-fabrique` liste les codes pour un affichage, sans mise en service.

## 3. Essai et mutation
- `tests/tirage.test.ts`, « une ligne image n'est en service que validée » : assertions sur `propose`, `brouillon`, `retire` (faux), `valide` (vrai), puis sur une copie de `tests/fixtures-bases/bases/5-formats.md` avec une ligne image `propose` (faux) / `valide` (vrai).
- Mutation rejouée dans un worktree jetable (retirer `&& f.etat === "valide"` de la branche `format_autre`) : **rouge** (1 échoué sur 29 dans `tirage.test.ts`). Après restauration : vert. Worktree supprimé.

## 4. Périmètre
`git diff --stat origin/main...origin/usine/L7-21` : `pilotage/journal/L7-21.md`, `src/reglages/modele.ts`, `src/tirage/formats.ts`, `tests/tirage.test.ts`. Rien d'autre ; `quotas.ts` non touché.

## 5. Vérifications (PostgreSQL 16 local)
- `pnpm install --frozen-lockfile` : OK.
- `next typegen && tsc --noEmit` : OK. `eslint .` : OK. `node scripts/garde.mjs` : OK.
- `vitest run` complet : **35 fichiers, 403 essais passés**, aucun sauté (dont `tirage`, `quotas`, `lots`, `porte`).
- Lignes ajoutées par le diff : aucun nom de personne, aucune adresse, aucune mention du dépôt privé.

## Remarques non bloquantes
- `FORMATS_AUTRES[f.code]` est un objet littéral : un code `constructor`, `toString` ou `__proto__` passe le filtre et donne une ligne au `type_contenu` absurde, toujours `en_service: false`. Comportement déjà présent sur `main`, sans effet sur le tirage ; un `Object.hasOwn` ou une `Map` le fermerait dans une PR à part.
- Le commentaire d'en-tête de `formats.ts` contient un prénom (« une ligne `propose` attend … ») sur une ligne de contexte inchangée, déjà sur `main` : hors de cette PR, à reprendre dans une PR de nettoyage pour la règle du dépôt public.
- `pnpm build` non relancé dans cette passe (non demandé).
