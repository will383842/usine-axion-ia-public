# Correction PR 16 (L7-32) · v3 · Sonnet

Tête de `usine/L7-32` après correction (vérifiée par `git ls-remote`) : **734229488d8aaebf02293857dfbe6e044248904f** (un commit au-dessus de b03bb41, rien de forcé ni rebasé).

Fichiers touchés : `scripts/publier-public.sh`, `docs/DEPOT-PUBLIC.md` seulement.

| Point | Correction | Cas d'essai (rougit sous mutation) |
|---|---|---|
| 1 | donnée `_authToken` assemblée ; l'arbre du dépôt passe la garde | « l'arbre du dépôt passe la garde » ; nom d'essai et adresse d'essai assemblés eux aussi |
| 2 | seul `./bases` (racine, sans casse) est écarté ; `src/app/reglages/bases` et `tests/fixtures-bases/bases` permis ; tout autre `bases/` refusé | copiés / refusé / racine écartée |
| 3 | exception locale ancrée juste après le mot de passe, sur la seule partie trouvée | 3 ruses d'adresse, nom de fichier `@postgres`, base vraiment locale |
| 4 | noms de fichiers contrôlés (secret, trace privée, nom interdit), sans afficher la valeur | 3 cas |
| 5 | bornes explicites sans `-w` + casse camel | `auteur_nom`, `jeanNom` |
| 6 | non-texte hors liste d'extensions refusé (UTF-16, archives, NUL) ; doc corrigée | UTF-16 ×2, `.gz`, `.png` permis |
| 7 | CRLF retiré de la liste de noms | liste CRLF |
| 8 | `./pnpm-lock.yaml` seul exclu, et seulement pour les adresses | 3 cas |
| 9 | `-iname '.env*'` sauf `.env.exemple` | `.env-prod`, `.env_prod`, `.envrc`, `.ENV.local` |
| 10 | variables secrètes en `grep -i` | `session_secret = …` |

11 accepté (noté). 12 non fait (facultatif).

Vérifié : `bash scripts/publier-public.sh --essai` → « Essai VERT » ; à blanc sur l'arbre du dépôt → code 0 ; une mutation par point rougit l'essai. Faux secrets et faux noms seulement, aucun appel réseau, aucune mise en ligne.
Non vérifié : `node scripts/garde.mjs` n'a pas pu tourner ici (dépendances non installées), la CI le fera.
