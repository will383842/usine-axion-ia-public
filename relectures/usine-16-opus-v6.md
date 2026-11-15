# Relecture PR 16 (L7-32, scripts/publier-public.sh) · v6 · Opus, lecture seule

## VERDICT FINAL : OK — FUSION POSSIBLE sur la tête complète fa0f93e8c8a0d0f36d660139e68ba53ed20007c9

Les trois points bas de la v5 sont corrigés. Rien d'autre n'a changé depuis d23bb21a. L'essai est vert, la mutation du cas zstd rougit, et la CI est verte.

Tête relue : `git rev-parse origin/usine/L7-32` = fa0f93e8c8a0d0f36d660139e68ba53ed20007c9 (attendue fa0f93e8…, conforme). Un seul commit depuis d23bb21a : fa0f93e.

## Vérifié
- `git diff d23bb21a..origin/usine/L7-32` : 2 fichiers, +4 −2, et seulement les trois corrections attendues.
  1. `scripts/publier-public.sh:434` : `"zstd:28b52ffd:png"` devient `"zstd:28b52ffd:jpg"`. Aucune autre ligne du script ne change. ✔
  2. `docs/DEPOT-PUBLIC.md:26` : la ligne dit maintenant « une archive renommée (gzip, zip, bzip2, xz, zstd) », comme la ligne 42. ✔
  3. `docs/DEPOT-PUBLIC.md:44` (nouvelle ligne) : « Autres limites acceptées » note les deux limites (le cas d'arbre lit la copie de travail et non `git archive` ; `Elodie` sans accent et `É` en NFD ne sont pas reconnus). ✔
- Diff contre `main` : `scripts/publier-public.sh` (+463) et `docs/DEPOT-PUBLIC.md` (+44), rien d'autre.
- `bash scripts/publier-public.sh --essai` sur le `git archive` de la tête : **VERT**, 0 ROUGE (14 s).
- Mutation : sur une copie jetable, `|| "$tete" == 28b52ffd*` est retiré de la ligne 94. Résultat : **ROUGE**, 1 cas (« v4-2. zstd renommé .jpg : code 1 (attendu 1, obtenu 0) »). Le cas d'essai rougit maintenant quand on retire son correctif.
- Sonde directe, avec un vrai en-tête zstd (`28b52ffd`) dans `src/c.jpg` :
  - avec le script de la tête, refusé (code 1) ;
  - avec le script muté, copié (code 0).
- Arbre de la tête (`git archive`), avec une liste de noms neutre : `--ecrire` donne le code 0, et `diff -r` entre la copie et l'arbre est vide.
- CI sur fa0f93e :
  - « Types, lint, garde, tests, build » : success ;
  - « Image Docker » : success ;
  - « Envoi au serveur » : skipped.

  `mergeable_state` vaut clean. La PR est encore en brouillon.

## À corriger
Rien.

## Méthode
Le clone a été fetché à neuf. L'arbre a été extrait par `git archive` dans le dossier temporaire de la session. Les mutations et les sondes ont été faites sur des copies jetables, avec seulement de faux noms et de faux octets. Aucun appel réseau n'a été fait, à part la lecture de la CI. Rien n'a été poussé hors de cette branche de relecture.
