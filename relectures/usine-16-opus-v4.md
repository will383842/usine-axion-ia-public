# Relecture PR 16 (L7-32, garde anti-fuite) · v4 · Opus, lecture seule

## VERDICT FINAL : À CORRIGER — tête complète 0f65c4647f929a9e229e9197a45810ccd9e12575

Le point bloquant de la v3 est corrigé : les espaces autour de « | » et le BOM UTF-8 ne font plus perdre de nom. Les points 2, 3, 4 et 6 sont corrigés aussi, et le point 5 est noté dans la doc. Chaque correctif retiré fait rougir l'essai (8 mutations sur 8). L'arbre du dépôt passe sa propre garde et la CI est verte.

Il reste un nouveau point bloquant, MOYEN, de la même famille que le point 1 de la v3 : un fichier de liste dont la dernière ligne n'a pas de fin de ligne perd ce dernier nom sans aucun message. Si le fichier ne contient qu'un seul nom, le contrôle des noms est éteint en entier, et `--ecrire` copie quand même. Le correctif tient en une ligne ; il a été vérifié.

Tête relue : `origin/usine/L7-32` = 0f65c4647f929a9e229e9197a45810ccd9e12575 (attendue 0f65c464…, conforme). Base : main 6fe9101.

## Conforme
- Le diff ne touche que `scripts/publier-public.sh` (+433) et `docs/DEPOT-PUBLIC.md` (+40). Aucun appel réseau, aucune adresse réelle, aucun nom de personne.
- `bash scripts/publier-public.sh --essai` sur `git archive` de la tête : **VERT**, 85 cas ok, 0 ROUGE (12 s).
- Arbre du dépôt (`git archive`) avec une liste de noms neutre : à blanc, code 0 (292 fichiers). Avec `--ecrire`, code 0, et `diff -r` entre la copie et l'arbre est vide.
  - Remarque : avec la liste `Dupontel | Élodie`, le script se refuse lui-même (16 fautes), parce que ses essais contiennent ces faux noms en clair. Ce n'est pas un défaut tant que la vraie liste ne contient que de vrais noms. C'est tout de même à savoir avant de copier une liste d'essai dans la vraie variable.
- CI sur 0f65c46 : « Types, lint, garde, tests, build » = success ; « Image Docker » = success ; « Envoi au serveur » = skipped. PR `mergeable_state` = clean.
- Points de la v3 rejoués par sondes jetables (rien n'a été poussé) :
  1. Listes `Dupontel | Élodie`, ` Dupontel |Élodie `, `Élodie | Dupontel` et `Dupontel<TAB>|<TAB>Élodie` : `// Dupontel`, `x Dupontel`, `// Élodie`, `Élodie fin` et `src/dupontel.md` sont tous refusés. Fichier de liste avec BOM, avec ou sans CRLF, avec ou sans espaces : premier nom reconnu. ✔
  2. `dupontelJean`, `DupontelJean`, `JEANDUPONTEL`, `DUPONTELJEAN`, `jeanDupontel`, `ÉLODIEJEAN`, `JEANÉLODIE` : refusés. `dupontelle` passe. ✔
  3. `bases.bak/`, `bases-2025/`, `BASES.old/`, `basesx`, `bases.source.json.bak`, `Bases.zip` à la racine : refusés. `bases.source.json` passe. ✔
  4. gzip renommé `.png`, `.jpg` ou `.WOFF2`, zip renommé `.ico`, bzip2 renommé `.png`, faux `.png` : refusés. Un vrai `.png` passe ; un `.png` qui contient un secret en clair est refusé. ✔
  5. `"SESSION_SECRET": "…"` : limite acceptée, notée dans `docs/DEPOT-PUBLIC.md` (« Limite acceptée »). ✔
  6. Mots répétés retirés de la doc. ✔
- Mutations (une par correctif, sur des copies jetables) : les 8 font rougir l'essai :

  | Correctif retiré | Cas rouges |
  |---|---|
  | BOM | 2 |
  | Espaces | 6 |
  | Nom en tête, capitale | 2 |
  | Nom en tête, minuscule | 2 |
  | Capitales collées | 3 |
  | Voisins de `bases/` | 5 |
  | En-tête des extensions permises | 2 |
  | Signature PNG | 2 |

## À corriger
1. **MOYENNE (bloquante)** · `scripts/publier-public.sh:156` (lecture par `while read`, `:165-175`). Le fichier `PUBLIER_NOMS_INTERDITS_FICHIER` est ajouté par `cat` sans fin de ligne forcée. Si sa dernière ligne n'a pas de saut de ligne (fréquent avec un éditeur, ou avec `printf 'Nom' > fichier`), `read` ne lit pas ce dernier nom. Sondes rejouées :
   - fichier `Élodie\nDupontel` sans fin de ligne, puis `// Dupontel` : **copié** (code 0) ;
   - fichier `Dupontel` seul, sans fin de ligne : **copié** (code 0). La liste n'est pas vide, donc le refus « liste absente » ne se déclenche pas, et aucun nom n'est contrôlé ;
   - fichier `Élodie` sans fin de ligne, plus la variable `PUBLIER_NOMS_INTERDITS=Dupontel` : les deux noms se collent en `ÉlodieDupontel`. `// Élodie` et `// Dupontel` sont **copiés** tous les deux.

   Correctif, vérifié sur une copie jetable : `{ cat "$PUBLIER_NOMS_INTERDITS_FICHIER"; echo; } >> "$LISTE_NOMS"`. La ligne vide qu'il ajoute est déjà retirée par le `sed`. Avec ce correctif, les trois sondes sont refusées et l'essai reste vert. Ajouter à l'essai le cas « fichier de liste sans fin de ligne ».
2. Basse · `scripts/publier-public.sh:92`. Seuls gzip et zip sont reconnus sous une extension permise autre que `.png`. Un bzip2 renommé `.jpg` ou un xz renommé `.webp` passent. La doc ne promet que « gzip ou zip » : elle est donc fidèle. Pour aller plus loin, ajouter les en-têtes `425a68` (bzip2), `fd377a58` (xz) et `28b52ffd` (zstd).
3. Basse · locale. Le script tourne sous la locale ambiante (ici POSIX). `grep -i` ne replie alors pas les lettres accentuées : `// élodie` et `élodieJean` passent pour `Élodie`, alors que `ÉLODIE` est bloqué. C'est le prolongement du point 8 de la v3, toujours ouvert. Piste : forcer `LC_ALL=C.UTF-8` pour la construction des motifs et les `grep`, si cette locale est disponible.
4. Basse · `scripts/publier-public.sh:174`. Le motif « capitales collées » produit un faux positif : `DUPONTELLE` est refusé pour `Dupontel`. Le refus est sûr, mais il peut gêner. Accepté si jugé rare.
5. Report de la v3, toujours ouvert, non bloquant : le point 7 (le cas « l'arbre passe la garde » lit la copie de travail, pas `git archive`) et le point 8 (`Elodie` sans accent, `É` en NFD).

Pour fusionner, le point 1 suffit. Les points 2 à 5 peuvent suivre dans une PR ultérieure.

## Méthode
L'arbre de la tête a été extrait par `git archive` dans un dossier temporaire, à partir du clone neuf déjà fetché. Chaque sonde crée une source jetable (`src/a.ts` propre plus une fuite), puis lance `--ecrire` vers une destination jetable. Seuls de faux secrets (`sk-ant-aaaa…`) et de faux noms (`Dupontel`, `Élodie`, `Zzfictif`) ont servi. Les mutations et le correctif d'essai ont été faits sur des copies jetables du script. Aucun appel réseau, et rien n'a été poussé hors de cette branche de relecture. En local, `node scripts/garde.mjs` ne tourne pas faute de `node_modules` ; la garde est verte en CI sur la tête.
