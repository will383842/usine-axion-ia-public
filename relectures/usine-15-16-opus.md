# Relecture usine PR 15 et PR 16 (Opus, lecture seule)

## VERDICT FINAL
- **PR 15 (L7-01, `usine/L7-01`, tête 537fdcf745c13c928d3cbb40e8e1c3392ffbe329) : À CORRIGER** (aucun point critique ; 2 points moyens).
- **PR 16 (L7-32, `usine/L7-32`, tête 71ab9f2867cae15c5b30a7eb7428540a70ecb00a) : À CORRIGER** (1 point critique : la garde anti-fuite se contourne).

Base commune des deux PR : main 9bf7958e4ef86060b0c448a2a702d8e37942202a. Sources : fiches L7-01 et L7-32, décision déléguée n° 4 du 15/11 (option A : secrets dans l'environnement `usine-production` du dépôt public, branche main seulement ; dépôt privé sans Actions, garde anti-fuite L7-32).

## PR 15 · L7-01 · `.github/workflows/ci.yml`
Conforme :
- Diff = le seul fichier autorisé par la fiche (9 ajouts, 2 retraits).
- Critère de la fiche tenu : `deployer` est « skipped » sans `vars.USINE_DEPLOY_ACTIF == 'true'` (constaté sur la CI de la tête : Envoi au serveur = skipped ; Types/lint/garde/tests/build et Image Docker = success). Aucune condition sur le nom du dépôt (consigne respectée).
- Échec explicite (`exit 1`) si le déploiement est activé sans clé, empreinte, hôte ou compte : plus de faux vert.
- Aucun secret ni valeur dans le diff ; aucune mise en ligne réelle ; aucun service payant ; aucun nom de personne ajouté.
- Pas de `pull_request_target` ; `permissions: contents: read` en tête ; `deployer` sans action tierce, environnement `usine-production`.

À corriger :
1. **Moyenne** · `.github/workflows/ci.yml:33-35, 61, 64-65, 71` : actions non fixées par SHA (`actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `docker/setup-buildx-action@v3`, `docker/login-action@v3`, `docker/build-push-action@v6`). Les tierces (pnpm, docker) tournent sur main avec `packages: write` et un secret en `build-args`. Préexistant, mais c'est le seul fichier de la fiche : fixer chaque `uses:` sur un SHA complet (version en commentaire).
2. **Moyenne** · `.github/workflows/ci.yml:41` : la garde anti-fuite ne lit que le nom des fichiers et seulement `bases/` à la racine. Rejoué (non poussé) : `bases/a.md` bloqué, mais `src/bases/a.md` et `.env.production` passent. Remplacer par `(^|/)bases/|(^|/)\.env(\..*)?$` en excluant `.env.exemple`, plus `\.(pem|key|p12)$`.
3. Basse · fiche « test rouge d'abord » : aucun essai possible hors `ci.yml` ; la preuve est la CI. Accepté, noté.
Hors PR, pour mémoire (basse) : `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` passe en `build-args` avec `cache-to: type=gha,mode=max` ; l'ARG reste dans l'étape `build` (pas dans l'image finale), mais il est dans le cache des étapes. À revoir avec U-DEPOT.

## PR 16 · L7-32 · `scripts/publier-public.sh`, `docs/DEPOT-PUBLIC.md`
Conforme :
- Diff = les deux fichiers nouveaux de la fiche, rien d'autre.
- `--essai` rejoué ici : « Essai VERT ». Aucun appel réseau, aucune Action, aucun service payant, aucune mise en ligne. À blanc par défaut, jamais de suppression, la valeur trouvée n'est jamais affichée.
- Rejeu avec fuites jetables (dossiers temporaires, rien poussé) : fichier propre → copié (code 0) ; faux jeton `sk-ant-…` → bloqué ; faux `SESSION_SECRET=…` → bloqué ; adresse réelle, trace du dépôt privé, lien symbolique, `bases/` → bloqués.

À corriger :
1. **CRITIQUE** · `scripts/publier-public.sh:68` (`return "$n"`) et `:87` : le code de retour d'un shell est pris modulo 256. Rejoué : 255 adresses réelles → refus ; **256 adresses réelles → code 0, fichier copié dans la destination**. Toute somme de fautes multiple de 256 ouvre la porte. Correctif : compter dans une variable globale (ou sur la sortie) et `return 1` dès que `n > 0` ; ajouter le cas 256 à l'essai.
2. **Haute** · `scripts/publier-public.sh:41-69` : aucun contrôle des noms de personnes. Rejoué : `// Auteur : Jean-Fictif Dupontel` et `{ prenom: "Marcel", nom: "Fictivier" }` → copiés (code 0). Correctif : liste de noms interdits lue dans un fichier ou une variable hors dépôt (ex. `PUBLIER_NOMS_INTERDITS`, valeur jamais dans le dépôt), refus si absente en mode `--ecrire` ; doc ligne « Garde anti-fuite » à compléter.
3. **Moyenne** · `scripts/publier-public.sh:49, 57, 59, 67` (`grep -I`) : les fichiers binaires ne sont pas lus. Rejoué : un faux `sk-ant-…` dans `data/x.bin` → copié. Correctif : refuser tout binaire hors d'une liste d'extensions (png, ico, woff2…) ou lire avec `grep -a`.
4. **Moyenne** · `scripts/publier-public.sh:11-22, 30-37` : jeton npm (`_authToken`, `npm_…`) non reconnu et `.npmrc` non exclu. Rejoué : `.npmrc` avec faux jeton → copié.
5. Basse · `scripts/publier-public.sh:123` : `Will@Example.COM` met un prénom dans le dépôt public ; prendre `Contact@Example.COM`.
6. Basse · `scripts/publier-public.sh:32, 43` : exclusion `bases` sensible à la casse (`Bases/` copié) ; utiliser `-iname`.
7. Basse · fiche « réutiliser garde-sortante.mjs / garde-bases-externe.mjs », « script node » : motifs recopiés en bash, risque de divergence avec `scripts/garde.mjs`. Lancer en plus `node scripts/garde.mjs` sur le dossier de passage avant toute écriture.
