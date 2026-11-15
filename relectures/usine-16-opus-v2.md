# Relecture PR 16 (L7-32, garde anti-fuite) · v2 · Opus, lecture seule

## VERDICT FINAL : À CORRIGER — tête complète b03bb41d9e1c032dc609135e92f052601a7d71bf

Le point CRITIQUE de la 1re relecture est corrigé : la sonde des 256 adresses est maintenant BLOQUÉE. Mais deux défauts HAUTS bloquent la fusion : le script refuse de recopier l'arbre de l'Usine (sa propre donnée d'essai le bloque), et il écarte sans rien dire 12 fichiers de code légitimes. Il reste aussi un contournement de l'adresse de base, qui diverge de `scripts/garde.mjs`.

Tête relue : `origin/usine/L7-32` = b03bb41d9e1c032dc609135e92f052601a7d71bf. La consigne attendait d83ae176… ; un commit de plus a été poussé (b03bb41, 05:06 UTC, « donnée d'essai assemblée… cas 256 adresses »). Toute la relecture porte sur b03bb41. Base : main 9bf7958.

## Conforme
- Diff limité à `scripts/publier-public.sh` (+225) et `docs/DEPOT-PUBLIC.md` (+35). L'essai est intégré au script (`--essai`), comme le demande la fiche.
- `--essai` rejoué : « Essai VERT », 0 échec.
- Aucun secret, aucun nom de personne, aucune adresse réelle, aucun appel réseau, aucun service payant, aucune mise en ligne réelle dans le diff. `Will@Example.COM` est devenu `Contact@Example.COM`.
- CI de b03bb41 : « Types, lint, garde, tests, build » = success ; « Image Docker » = success ; « Envoi au serveur » = skipped.
- Points 1 à 6 de la 1re relecture, rejoués (sources jetables, rien poussé) :
  - 256 adresses réelles → code 1, rien copié. 512 adresses → bloqué. 128 adresses + 128 jetons → bloqué.
  - Noms interdits : nom simple, en MAJUSCULES, dans un binaire, en fin de ligne CRLF, ÉLODIE en capitales accentuées → bloqués. `--ecrire` sans liste → refus.
  - Binaire avec NUL → bloqué. `npm_…` → bloqué. `.npmrc`, `.ENV`, `BASES/` et `x/bases/` jamais copiés.
  - Autres cas bloqués : secret dans un nom de fichier avec espaces, accentué ou en sous-dossier profond ; secret en CRLF ; adresse en majuscules ; trace privée en majuscules ou sans séparateur ; lien symbolique.
- Fichier propre : copié, code 0.

## À corriger
1. **HAUTE** · `scripts/publier-public.sh:204` : la donnée d'essai `_authToken=zzzzzzzzzzzz` déclenche la garde du script lui-même. Rejoué : l'arbre de b03bb41 (`git archive`) passé à blanc → « FUITE : secret probable : scripts/publier-public.sh:204 », code 1, rien de recopiable. La recopie de l'Usine (qui contient ce script) est donc toujours refusée. Correctif : assembler la donnée comme aux lignes 174 et 189, par exemple `printf '…:_auth%s=%s' Token "$(printf 'z%.0s' $(seq 1 12))"`. Ajouter à l'essai un cas « l'arbre du dépôt passe la garde ».
2. **HAUTE (fonctionnel)** · `scripts/publier-public.sh:34` (`-iname bases` élague à toute profondeur) et `docs/DEPOT-PUBLIC.md` (« à toute profondeur ») : 12 fichiers suivis légitimes ne sont jamais recopiés, sans aucun message. Ce sont `src/app/reglages/bases/{page.tsx,actions.ts,Recharger.tsx}` et `tests/fixtures-bases/bases/*.md` (9 bases FICTIVES dont les essais ont besoin). Comme rien n'est jamais supprimé, la copie publique garderait des versions périmées ; une destination neuve n'aurait plus l'écran Réglages › Bases ni les données d'essai. Correctif : n'exclure que `./bases` (racine, sans casse) et refuser plutôt que taire tout autre `bases/` qui ne figure pas dans une liste permise nommée (`src/app/reglages/bases`, `tests/fixtures-bases/bases`).
3. **HAUTE** · `scripts/publier-public.sh:60-65` : l'exception des bases locales cherche `@localhost|@127.0.0.1|@postgres` n'importe où dans l'adresse, et dans le nom du fichier, au lieu de la tester juste après le mot de passe. Rejoué : `postgres://u:mdpreel@10.1.2.3:5432/db?x=@localhost/` → copié (code 0). `postgres://u:mdpreel@dbprod:5432/db#@postgres/` → copié. Une adresse sans ruse dans un fichier nommé `x:y:@postgres:z.ts` → copiée. `scripts/garde.mjs:37` bloque ce cas (lecture anticipée juste après `@`) : le script s'écarte de la règle qu'il dit suivre. Correctif : ancrer le test, par exemple `[[ "$m" =~ ^postgres(ql)?://[^:/]+:[^@]+@(localhost|127\.0\.0\.1|postgres)([:/]|$) ]]`, en travaillant sur la seule partie trouvée (`grep -ho`, sans le nom du fichier).
4. **MOYENNE** · `scripts/publier-public.sh:50-75` : les noms des fichiers et des dossiers ne sont jamais contrôlés. Rejoué : `src/sk-ant-aaaa….txt`, `src/axion-plans-prive.md` (trace privée, règle L7-02) et `src/dupontel.md` (nom interdit) → copiés. Correctif : passer aussi la liste des chemins (`find … -print`) aux mêmes motifs.
5. **MOYENNE** · `scripts/publier-public.sh:53` (`grep -w`) : `_` compte comme une lettre et la casse « camel » colle les mots. Rejoué : `auteur_dupontel` et `jeanDupontel` → copiés. Correctif : bornes explicites `(^|[^[:alpha:]])nom` sans `-w`, ou découpage de `_` et des majuscules.
6. **MOYENNE** · `scripts/publier-public.sh:53, 55-75` et `docs/DEPOT-PUBLIC.md` (« binaires lus comme les autres ») : un fichier en UTF-16 ou compressé n'est pas lu. Rejoué : un faux `sk-ant-…` en UTF-16LE, ou dans un `.gz`, → copié ; la trace privée en UTF-16 → copiée. Correctif : refuser tout fichier non texte hors d'une liste d'extensions (png, ico, woff2, jpg, svg…), ou au moins refuser `.gz`, `.zip`, `.tar` et l'UTF-16 (marque BOM ou octets NUL alternés). Corriger la phrase de la doc.
7. **MOYENNE** · `scripts/publier-public.sh:97-101` : une liste de noms écrite avec des fins de ligne CRLF (fichier préparé sous Windows) ne reconnaît plus aucun nom (`Dupontel\r`), et cela sans avertissement. Rejoué : la liste CRLF contre `Dupontel` → copié. Correctif : `tr -d '\r'` sur la liste.
8. Basse · `scripts/publier-public.sh:57, 65, 67, 75` (`--exclude=pnpm-lock.yaml`) : tout fichier nommé `pnpm-lock.yaml`, à n'importe quelle profondeur, échappe aux secrets, à la trace privée et aux adresses. Rejoué : `src/pnpm-lock.yaml` avec un faux `sk-ant-…` → copié. Correctif : n'exclure que `./pnpm-lock.yaml`, et seulement pour le motif des adresses.
9. Basse · `scripts/publier-public.sh:36` : `.env-prod`, `.env_prod` et `.envrc` ne sont pas exclus (seul `.env.*` l'est). Rejoué : `.env-prod` → copié. Correctif : `-iname '.env*' ! -name .env.exemple`.
10. Basse · `scripts/publier-public.sh:23` : variables secrètes reconnues en majuscules seulement (`session_secret = …` → copié). Correctif : `grep -i` pour ce motif.
11. Basse · `scripts/publier-public.sh:71` : les adresses dont le domaine commence par un chiffre (`…@163.com`) passent. C'est la même règle que `scripts/garde.mjs:77`, conservée pour les versions de paquets (`pkg@1.2`). Accepté, noté.
12. Basse · nom accentué : `É` décomposé (NFD) ou écrit sans accent (`Elodie` pour `Élodie`) passe. Correctif léger : normaliser en NFC et retirer les accents des deux côtés (`iconv -t ASCII//TRANSLIT`).

## Méthode
Le script de b03bb41 est extrait dans un dossier temporaire. Chaque sonde crée une source jetable (`src/a.ts` propre plus une fuite) et lance `--ecrire` vers une destination jetable. Seuls de faux secrets et de faux noms sont utilisés (`Dupontel`, `Élodie`, `sk-ant-aaaa…`, `@reelle.fr`). Rien n'a été poussé ni mis en ligne.
