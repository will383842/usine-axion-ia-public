# Relecture PR 16 (L7-32, garde anti-fuite) · v3 · Opus, lecture seule

## VERDICT FINAL : À CORRIGER — tête complète 734229488d8aaebf02293857dfbe6e044248904f

Les 3 points HAUTS et les points 4 à 10 de la v2 sont corrigés, rejoués et tenus par l'essai : chaque correctif retiré fait rougir l'essai (13 mutations sur 13). L'arbre du dépôt passe sa propre garde. Il reste un seul point bloquant, MOYEN : la liste des noms interdits perd des noms sans rien dire quand on l'écrit « Nom1 | Nom2 », avec des espaces, alors que la doc dit justement « séparés par « | » ». Les autres points sont bas et ne bloquent pas.

Tête relue : `origin/usine/L7-32` = 734229488d8aaebf02293857dfbe6e044248904f (attendue 73422948…, conforme). Base : main 6fe9101.

## Conforme
- Diff limité à `scripts/publier-public.sh` (+369) et `docs/DEPOT-PUBLIC.md` (+36). Aucun appel réseau, aucune adresse réelle, aucun nom de personne, aucune mise en ligne.
- `bash scripts/publier-public.sh --essai` sur `git archive` de la tête : **VERT**, 63 cas ok, 0 ROUGE (9 s).
- Arbre du dépôt (`git archive`) : à blanc, code 0 (292 fichiers) ; avec `--ecrire`, code 0, et la copie est identique à l'arbre (`diff -r` vide, `src/app/reglages/bases` et `tests/fixtures-bases/bases` compris).
- CI de 7342294 : « Types, lint, garde, tests, build » = success ; « Image Docker » = success ; « Envoi au serveur » = skipped.
- Points de la v2 rejoués par sondes jetables (rien n'a été poussé) :
  1. Le `_authToken` en clair est bloqué ; la donnée d'essai est assemblée ; l'arbre passe la garde. ✔
  2. Seul `./bases` est écarté (sans tenir compte de la casse). Les deux `bases/` permis sont copiés. `src/x/bases`, `src/x/BASES` et un `bases/` imbriqué dans un emplacement permis sont refusés. ✔
  3. Les ruses `?x=@localhost`, `#@postgres`, le nom de fichier `x:y:@postgres:z.ts`, `localhost.evil.fr`, un mot de passe contenant `@` et une base locale suivie d'une base de production sur la même ligne sont tous refusés. La base vraiment locale passe. ✔
  4. Secret, trace privée, nom interdit ou adresse dans un nom de fichier ou de dossier : refusés. ✔
  5. `auteur_dupontel`, `jeanDupontel`, `dupontel2` : refusés. ✔
  6. UTF-16 avec ou sans BOM, `.gz`, gzip renommé `.dat`, bzip2 renommé (5 tirages) : refusés. Un vrai `.png` passe ; un `.png` qui contient un secret en clair est refusé. ✔
  7. Liste de noms en CRLF : reconnue ; fichier de liste introuvable avec `--ecrire` : refus. ✔
  8. Un secret dans `src/pnpm-lock.yaml` ou dans `./pnpm-lock.yaml` est refusé. Seule une adresse dans `./pnpm-lock.yaml` passe. ✔
  9. `.env-prod`, `.env_prod`, `.envrc`, `.ENV`, `.Env.local`, `src/.env` ne sont jamais copiés. ✔
  10. `session_secret = …` et `export SESSION_SECRET=…` : refusés. ✔
  11. `@163.com` passe : accepté (même règle que `scripts/garde.mjs`).
- Robustesse : un nom de fichier qui contient un saut de ligne ou des « : », un fichier sans fin de ligne ou un fichier en droits 000 restent contrôlés. 256 fautes : code 1.
- Mutations (une par correctif, sur une copie jetable) : les 13 font rougir l'essai : base locale non ancrée, chemins non contrôlés, `grep -w`, cas camel retiré, contrôle non-texte retiré, CRLF non retiré, `pnpm-lock` exclu partout, `.env` étroit, variables sans `-i`, `-iname bases`, `bases/` hors permis toléré, `_authToken` en clair, repli modulo 256.

## À corriger
1. **MOYENNE** · `scripts/publier-public.sh:149` et `:151`, `docs/DEPOT-PUBLIC.md:24`. Les noms de la liste ne sont pas débarrassés de leurs espaces. Avec `PUBLIER_NOMS_INTERDITS="Dupontel | Élodie"`, l'écriture naturelle de « séparés par « | » », l'essai rejoué donne :
   - `// Dupontel` en fin de ligne : copié ;
   - `src/dupontel.md` : copié ;
   - `// Élodie` : bloqué, mais seulement grâce à l'espace qui le précède.

   De même, un fichier de liste qui commence par un BOM UTF-8 (fréquent sous Windows) ne reconnaît plus son premier nom : copié. La perte est silencieuse.

   Correctif : retirer les espaces en tête et en fin de chaque nom et le BOM (`sed 's/^\xef\xbb\xbf//; s/^[[:space:]]*//; s/[[:space:]]*$//'`) avant de bâtir `.re` et `.camel`. Ajouter à l'essai les cas « Nom1 | Nom2 » et « liste avec BOM ».
2. Basse · `scripts/publier-public.sh:157-159`. Le nom n'est reconnu en casse camel que s'il est collé après une minuscule. Un nom placé en tête (`dupontelJean`, `DupontelJean`) ou collé tout en capitales (`JEANDUPONTEL`) est copié. La doc décrit fidèlement ce périmètre (« collé après une minuscule »). Correctif léger : ajouter le motif `nom[[:upper:]]` sans casse sur le début.
3. Basse · `scripts/publier-public.sh:44` et `:79-81`. Un dossier voisin à la racine, comme `bases.bak/` ou `bases-2025/`, est copié sans message. Correctif : refuser tout `./bases?*` à la racine (`-ipath './bases?*'` dans la garde).
4. Basse · `scripts/publier-public.sh:87`. Une extension permise court-circuite le contrôle des octets de tête : une archive gzip renommée `.png`, ou zip renommée `.woff2`, passe. La doc (« archive … refusée ») est donc un peu trop large. Correctif : tester l'en-tête (`1f8b`, `504b`) même pour les extensions permises, sauf pour `woff`/`woff2`, et vérifier pour `png` la signature `89504e47`.
5. Basse · `scripts/publier-public.sh:26`. `"SESSION_SECRET": "…"` (clé JSON entre guillemets) passe. `scripts/garde.mjs:38` a le même trou ; à corriger des deux côtés, ou à noter comme accepté.
6. Basse · `docs/DEPOT-PUBLIC.md:22`. Mots répétés : « mêmes familles que `scripts/garde.mjs` : mêmes familles que `scripts/garde.mjs` : ».
7. Basse · `scripts/publier-public.sh:275`. Le cas « l'arbre du dépôt passe la garde » lit la copie de travail, pas `git archive`. Il peut donc rougir à cause d'un fichier local non suivi, ou verdir alors qu'un fichier suivi est ignoré par `lister`. Suggestion : `git -C "$racine" archive HEAD | tar -x` vers un dossier temporaire quand `.git` existe.
8. Facultatif (point 12 de la v2, toujours ouvert) : `Elodie` sans accent et `É` décomposé (NFD) passent pour `Élodie`. `ÉLODIE` et `jeanÉlodie` sont bien bloqués.

Pour fusionner, le point 1 suffit. Les points 2 à 8 peuvent suivre dans une PR ultérieure.

## Méthode
Un clone neuf a été fetché ; l'arbre de la tête a été extrait par `git archive` dans un dossier temporaire. Chaque sonde crée une source jetable (`src/a.ts` propre plus une fuite) et lance `--ecrire` vers une destination jetable. Seuls de faux secrets (`sk-ant-aaaa…`, `kkkk…`) et de faux noms (`Dupontel`, `Élodie`, `@reelle.fr`) ont servi. Les mutations ont été faites sur des copies jetables du script. Aucun appel réseau, rien n'a été poussé hors de cette branche de relecture.
