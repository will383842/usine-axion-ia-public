# Relecture usine PR 15 v2 (Opus, lecture seule)

## VERDICT FINAL
**OK — FUSION POSSIBLE sur la tête complète f9cd574ca1f9ae82c0f8894c6144f0188c33f2f9** (PR 15, L7-01, `usine/L7-01`, base main 9bf7958e4ef86060b0c448a2a702d8e37942202a). Les 2 points moyens de la 1re relecture sont corrigés et rejoués. Reste 1 remarque basse, non bloquante.

## Contrôles
- Tête vérifiée : `git rev-parse origin/usine/L7-01` = f9cd574ca1f9ae82c0f8894c6144f0188c33f2f9 (= tête de la PR sur GitHub).
- Diff `main...usine/L7-01` : un seul fichier, `.github/workflows/ci.yml` (16 ajouts, 9 retraits, 2 commits). Conforme à la liste fermée.

### Point 1 (moyen) — actions fixées par SHA : CORRIGÉ
Les 7 `uses:` sont sur un SHA complet ; chaque SHA vérifié par `git ls-remote --tags` sur le dépôt de l'action :
- actions/checkout 11d5960a… = v4 / v4.4.0 (2 usages)
- pnpm/action-setup b906affc… = v4 / v4.3.0 (tag annoté, commit pelé)
- actions/setup-node 49933ea5… = v4 / v4.4.0
- docker/setup-buildx-action 8d2750c6… = v3 / v3.12.0
- docker/login-action c94ce9fb… = v3 / v3.7.0
- docker/build-push-action 10e90e36… = v6 / v6.19.2
Aucune action non fixée.

### Point 2 (moyen) — garde anti-fuite : CORRIGÉ
Motif appliqué : `(^|/)bases/|(^|/)\.env(\..*)?$|\.(pem|key|p12)$` (insensible à la casse), exclusions `(^|/)\.env\.exemple$`, `^src/app/reglages/bases/`, `^tests/fixtures-bases/`. Rejoué localement avec la commande exacte :
- bloqués : `bases/a.md`, `src/bases/a.md` (passait avant), `.env.production` (passait avant), `.env`, `sub/.env`, `Bases/a.md`, `id.pem`, `k.KEY`, `c.p12` ;
- passent (attendu) : `.env.exemple`, `x/.env.exemple`, `bases.source.json`, `tests/fixtures-bases/x.md`, `src/app/reglages/bases/page.tsx` ;
- arbre actuel de la tête : aucune ligne trouvée, la garde est verte.

### Sécurité du workflow
- Déclencheurs : `pull_request` et `push` sur main. Aucun `pull_request_target`.
- `permissions: contents: read` en tête ; `image` : `contents: read`, `packages: write` (nécessaire pour pousser sur ghcr, login et push limités à push sur main) ; `deployer` : `contents: read`, `packages: read`. Minimal.
- Secrets : seulement par référence `${{ secrets.… }}` / `${{ vars.… }}` ; aucune valeur dans le diff. Aucun nom de personne ajouté.
- Aucun service payant (runners ubuntu-latest, ghcr, cache gha).
- `deployer` : « skipped » sans `vars.USINE_DEPLOY_ACTIF == 'true'` ; activé sans clé/empreinte/hôte/compte → `exit 1` ; aucune action tierce dans ce job.
- Syntaxe : YAML valide (analyse Python `yaml.safe_load`) et relecture manuelle (clés, expressions `${{ }}`, `if:`, `needs:`, `environment:`). actionlint : binaire téléchargé mais son exécution a été refusée dans cet environnement ; la CI GitHub, qui refuse un workflow invalide, a tourné normalement.

### CI de la tête f9cd574
- Types, lint, garde, tests, build : success
- Image Docker : success
- Envoi au serveur : skipped (attendu)

## Remarques
1. Basse, non bloquante · `.github/workflows/ci.yml:41` : les deux exclusions portent sur des dossiers entiers et pour tous les motifs. Rejoué : `src/app/reglages/bases/.env` et `src/app/reglages/bases/bases/a.md` passent ; `.envrc` passe aussi. Possible plus tard : n'exclure ces dossiers que du motif `bases/`.
2. Hors PR (déjà noté) : `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` en `build-args` avec cache gha `mode=max`, à revoir avec U-DEPOT.
