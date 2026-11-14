# Relecture PR 13 · L7-21 (formats en service, type image) · Opus

**Verdict : À CORRIGER. Fusion possible : non, pas en l'état.** Le correctif tient en une ligne (point 1).

Branche `usine/L7-21`, tête `11cc5836`, base `646daa9` (main, après PR 11 et PR 12).

## Point bloquant

1. **`src/tirage/formats.ts:29` : la ligne `image` de `format_autre` passe en service sans `etat = 'valide'`.**
   La branche vidéo (l. 26) exige `f.etat === "valide"`, mais la branche `format_autre` ne regarde que
   `etat_service === "en_service"` et le type. Avant cette PR, aucun type autre que la vidéo n'était en service :
   l'écart ne servait à rien. Maintenant que `image` est ouvert, c'est la première porte par laquelle une ligne
   `propose` (en attente de validation) entre dans le tirage, ce qui contourne le principe de la PR 11 (L7-22) au niveau du format.
   Preuve (essai jetable, non poussé) : `formatsDuTirage([], [{ code: "image", etat_service: "en_service", etat: "propose" }])`
   → `[{"code":"image","type_contenu":"image","en_service":true}]`.
   Correctif : ajouter `&& f.etat === "valide"` dans la ligne 29, plus une assertion dans le nouvel essai
   (une ligne `image` à l'état `propose` reste `en_service: false`). Le commentaire d'en-tête (l. 4-7) n'évoque
   que la vidéo et doit couvrir ce cas aussi.

## Critères de la fiche

- (1) `type=image` rend des lignes : **OK**. `tests/tirage.test.ts:507-524`, lignes toutes au format `image`.
- (2) le lecteur lit une copie de la base 5 sans erreur : **OK**, avec une réserve. La « copie » est une table écrite
  dans l'essai (format_video + format_autre avec `image`), pas une copie de `tests/fixtures-bases/bases/5-formats.md`.
  `preparer()` la lit sans aucun refus (`fichiersRefuses` et `lignesRefusees` vides). Cela suffit pour le critère.

## Vérifications

- Fichiers : exactement `src/tirage/formats.ts`, `src/reglages/modele.ts`, `tests/tirage.test.ts`, `pilotage/journal/L7-21.md`.
  `src/reglages/quotas.ts` n'est pas touché.
- `pnpm install --frozen-lockfile` : OK. `vitest run` (PostgreSQL 16 local) : **402/402 passés**, 35 fichiers
  (tirage, lots, porte, quotas compris). `pnpm typecheck` : sans erreur. `pnpm lint` : sans erreur. `node scripts/garde.mjs` : code 0.
  (Un premier passage a montré un échec dans `porte · aucun écran modifié`. Il venait de mon clone, où `origin/main` était périmé.
  Après réalignement sur `646daa9`, l'essai est vert. Ce n'est pas un défaut de la PR.)
- Aucun `.skip` ni `.only` dans le diff. Aucun nom de personne dans les lignes ajoutées. Aucune suppression ni anonymisation de données.
- Mutations rejouées en copie jetable :
  - M1 retirer `"image"` de `FORMATS_TIRAGE_EN_SERVICE` → **rouge** (le nouvel essai L7-21).
  - M2 casser le filtre `valide` du chargeur (`cas_usage` sans `etat = 'valide'`, `src/tirage/charger.ts`) → **rouge**
    (« un métier, une douleur ou un cas « propose » n'est jamais tiré »).
  - M2c retirer le filtre de type en service sur `format_autre` → **rouge** (essai L7-21 et `tests/porte.test.ts:241`).
  - M2b (pour information) retirer `f.etat === "valide"` côté vidéo (`formats.ts:26`) → **reste vert sur toute la suite**.
    Ce défaut est antérieur à la PR : le filtre `valide` des formats n'est couvert par aucun essai. Le correctif du point 1
    devrait ajouter une assertion pour les deux branches.

## Quotas (PR 12) et filtre `valide` (PR 11)

- Les quotas (`src/reglages/quotas.ts`) ne sont pas branchés sur le tirage : seuls l'écran `/reglages/quotas` et
  `projeter()` les utilisent. L'ajout du type `image` ne les contourne pas et ne les fausse pas. En contrepartie,
  rien ne plafonne encore les images tirées (2/semaine) : ce branchement n'appartient pas à L7-21.
- Libellés : le même code `image` s'appelle « Texte avec image » dans `src/reglages/modele.ts:15` et « Infographies » dans
  `src/reglages/quotas.ts:15`. Ce n'est pas bloquant ici, mais il faut l'arbitrer avant d'ouvrir la part image à l'écran.
- Les lignes métier, douleur et cas d'usage restent filtrées sur `valide` (PR 11 intacte, M2 rouge). La fuite est au niveau du format (point 1).

## Remarques non bloquantes

- `tests/porte.test.ts:241` : le titre et le commentaire disent « image, pas encore en service (FORMATS_EN_SERVICE) ».
  L'essai reste vert parce que la base fictive n'a pas de ligne `image`, pas parce que le type est fermé. Le texte est trompeur
  (fichier hors liste : à reprendre avec l'ouverture de la part image).
- `src/tirage/charger.ts:95` : les parts par défaut ne portent que sur la vidéo. Sans `partsFormats` explicite, le tirage
  n'attribue aucune part à l'image. Le journal le dit, et c'est cohérent avec « livré éteint ».
- Deux listes `FORMATS_EN_SERVICE` / `FORMATS_TIRAGE_EN_SERVICE` cohabitent. Le choix est assumé dans le journal ; il faudra les fusionner une fois la part ouverte.
