# Relecture PR 16 (L7-32, scripts/publier-public.sh) · v5 · Opus, lecture seule

## VERDICT FINAL : À CORRIGER (points bas seulement) — tête complète d23bb21a6aed6402ff47426d92b584f4f40e5b2c

Le point bloquant de la v4 est corrigé : un fichier de liste sans fin de ligne ne perd plus son dernier nom. Les points bas 2 et 3 de la v4 sont corrigés aussi (en-têtes bzip2, xz et zstd ; locale `C.UTF-8`), et le point 4 (`DUPONTELLE`) est maintenant noté dans la doc comme accepté. L'essai est vert, l'arbre du dépôt passe sa propre garde, et la CI est verte.

Il ne reste aucun point bloquant pour la sécurité. Mais trois points bas restent ouverts sans être notés dans la doc comme acceptés. Le plus net : le nouveau cas d'essai zstd ne rougit pas quand on retire son correctif. Chaque point se règle en une ligne. Une fois ces trois lignes faites, ou les points notés comme acceptés dans la doc, le verdict passe à OK.

Tête relue : `git rev-parse origin/usine/L7-32` = d23bb21a6aed6402ff47426d92b584f4f40e5b2c (attendue d23bb21a…, conforme). La branche part de 9bf7958, et `main` est à 6fe9101 (#15, qui ne touche que `.github/workflows/ci.yml`). La fusion locale avec `main` se fait sans conflit.

## Conforme
- Diff contre `main` : `scripts/publier-public.sh` (+463) et `docs/DEPOT-PUBLIC.md` (+42), rien d'autre. Aucun appel réseau, aucun nom de personne, seulement de faux secrets.
- `bash scripts/publier-public.sh --essai` sur le `git archive` de la tête : **VERT**, 94 cas ok, 0 ROUGE (15 s). La locale `C.utf8` existe sur la machine, donc les cas `v4-3` (accents) ont tourné.
- Arbre du dépôt (`git archive` de la tête), avec une liste de noms neutre :
  - à blanc : code 0, 292 fichiers ;
  - `--ecrire` : code 0, et `diff -r` entre la copie et l'arbre est vide ;
  - même résultat (code 0) sur l'arbre fusionné avec `main` 6fe9101.
- CI sur d23bb21 : « Types, lint, garde, tests, build » = success, « Image Docker » = success, « Envoi au serveur » = skipped. `mergeable_state` = clean. La PR est encore en brouillon.
- Points de la v4 rejoués par sondes jetables (non poussées), avec les faux noms `Dupontel`, `Élodie` et `Zzfictif` :
  1. Liste sans fin de ligne :
     - `Élodie\nDupontel`, puis `// Dupontel` : refusé (code 1) ;
     - `Dupontel` seul : refusé ;
     - fichier `Élodie` plus la variable `Dupontel` : `// Élodie` et `// Dupontel` sont refusés tous les deux ;
     - BOM + CR sans LF : refusé ;
     - espaces sans LF : refusé ;
     - témoin neutre : copié (code 0). ✔
  2. En-têtes (vrais octets) :
     - bzip2 renommé `.jpg` ou `.woff2` : refusé ;
     - xz renommé `.webp` ou `.ico` : refusé ;
     - zstd renommé `.jpg` ou `.woff` : refusé ;
     - gzip renommé `.png` et zip renommé `.ico` : refusés ;
     - vrai en-tête JPEG (`ffd8ffe0`) : copié. ✔
  3. Locale : `// élodie`, `élodieJean`, `jean.élodie`, `ÉLODIE` et `// Élodie` sont refusés pour `Élodie`, même lancé sous `LC_ALL=POSIX`. ✔
  4. `DUPONTELLE` : accepté et noté dans la doc (« Limite acceptée »). ✔
  - Secret `sk-ant-…` factice : refusé. ✔
- Mutations (une par correctif, sur des copies jetables) :

  | Correctif retiré | Résultat de `--essai` |
  |---|---|
  | `echo` après `cat` (liste sans fin de ligne) | ROUGE, 4 cas |
  | en-tête bzip2 (extension permise) | ROUGE, 1 cas |
  | en-tête xz (extension permise) | ROUGE, 1 cas |
  | locale `C.UTF-8` | ROUGE, 2 cas |
  | en-tête zstd (extension permise) | **VERT**, voir point 1 |

## À corriger
1. **Basse** · `scripts/publier-public.sh:434`. Le cas d'essai `zstd:28b52ffd:png` ne prouve rien, parce qu'un `.png` sans signature PNG est déjà refusé par ailleurs. Si l'on retire l'en-tête zstd de la ligne 94, l'essai reste vert, alors qu'un zstd renommé `.jpg` est alors **copié** (code 0, sonde rejouée). Le code de la tête est juste, seul l'essai est faible. Correctif : `"zstd:28b52ffd:jpg"`, ou toute extension permise autre que `png`.
2. **Basse** · `docs/DEPOT-PUBLIC.md:26`. La ligne parle encore d'« une archive gzip ou zip renommée », alors que la ligne 42 annonce gzip, zip, bzip2, xz et zstd. Aligner la ligne 26 sur la ligne 42.
3. **Basse** · report de la v3 (points 7 et 8), toujours absent de la doc :
   - le cas « l'arbre passe la garde » lit la copie de travail, pas `git archive` ;
   - `Elodie` sans accent et `É` en NFD ne sont pas reconnus pour `Élodie`.

   Ces deux limites ne figurent pas sous « Limite acceptée ». Les y noter en une ligne suffit.

Aucun de ces points n'ouvre une fuite sur le code de la tête. Si les trois sont faits, ou notés comme acceptés dans la doc, le verdict passe à OK — FUSION POSSIBLE.

## Méthode
Le clone a été fetché à neuf. L'arbre de la tête a été extrait par `git archive` dans le dossier de travail temporaire de la session. Chaque sonde crée une source jetable (`src/a.ts` propre plus une fuite), puis lance `--ecrire` vers une destination jetable. Les mutations ont été faites sur des copies jetables du script. Le contrôle de fusion a été fait dans un worktree temporaire, retiré ensuite. Seuls de faux secrets et de faux noms ont servi. Aucun appel réseau n'a été fait, à part la lecture de la CI. Rien n'a été poussé hors de cette branche de relecture.
