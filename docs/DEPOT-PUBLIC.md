# Recopie vers le dépôt public

Le dépôt public ne contient que le code de l'Usine. Les bases réelles, les plans et la production restent privés. Ce document décrit la recopie à sens unique, lancée à la main par le fondateur.

## Principe
- Un seul sens : de la copie de travail de l'Usine vers une copie du dépôt public. Jamais l'inverse.
- Aucune Action dans le dépôt privé, aucune horloge : la recopie se lance à la main, depuis un poste ou un cloud.
- Les secrets de déploiement sont posés dans le dépôt public (masqués par GitHub). Aucun secret n'est affiché ni copié dans un fichier.

## Lancer
1. À blanc (par défaut, n'écrit rien) : `scripts/publier-public.sh <dossier source> <dossier destination>`
2. Réelle : `scripts/publier-public.sh --ecrire <dossier source> <dossier destination>`
3. Dans la destination : relire `git diff`, lancer `pnpm verifier`, puis ouvrir la PR.

## Ce qui n'est jamais copié
`bases/` à la racine (sans tenir compte de la casse), `.git`, `node_modules`, tout `.env*` (`.env`, `.env.*`, `.env-prod`, `.envrc`… sauf `.env.exemple`), `.npmrc`, clés (`*.pem`, `*.key`, `*.p12`, `id_rsa*`, `id_ed25519*`), sorties de build (`.next`, `out`, `build`, `coverage`), `ALERTE-BASES.txt`.

## Garde anti-fuite (avant toute copie)
Le script prépare la copie dans un dossier de passage, la contrôle, et ne touche à la destination que si tout est propre. Refus (code 1, rien copié) si :
- un `bases/` hors de la racine s'y trouve, sauf les deux emplacements permis nommés (`src/app/reglages/bases`, écran Réglages › Bases, et `tests/fixtures-bases/bases`, bases fictives des essais) : tout autre est refusé, jamais tu ;
- un lien symbolique s'y trouve ;
- un secret probable apparaît, dans un contenu ou dans un nom de fichier ou de dossier (variables secrètes reconnues quelle que soit la casse ; mêmes familles que `scripts/garde.mjs` : clés privées, jetons, hachages, adresses de base avec mot de passe, variables secrètes) ; l'exception des bases locales (`localhost`, `127.0.0.1`, `postgres`) n'est admise que juste après le mot de passe ;
- un jeton npm (`npm_…`, `_authToken`) apparaît ;
- un nom de la liste des noms interdits apparaît, entre deux non-lettres (`auteur_nom` compte), collé après une minuscule (`jeanNom`), placé en tête (`nomJean`, `NomJean`) ou collé tout en capitales (`JEANNOM`), en contenu comme en nom de fichier (liste hors dépôt : variable `PUBLIER_NOMS_INTERDITS`, noms séparés par « | », espaces autour et BOM UTF-8 ignorés, ou fichier `PUBLIER_NOMS_INTERDITS_FICHIER`, un nom par ligne, fins de ligne Windows admises ; sans liste, `--ecrire` refuse et l'à blanc avertit) ;
- le dépôt privé des plans est nommé quelque part, contenu ou nom de fichier (règle L7-02) ;
- un fichier n'est pas du texte (UTF-16, archive `.gz` `.zip` `.tar`…, binaire avec octets nuls) et n'a pas une extension d'image ou de police permise (`png`, `ico`, `woff`, `woff2`, `jpg`, `jpeg`, `gif`, `webp`, `avif`) ; même avec une extension permise, une archive renommée (gzip, zip, bzip2, xz, zstd), ou un `.png` sans signature PNG, est refusé ;
- un dossier ou fichier voisin de `bases/` à la racine (`bases.bak`, `bases-2025`…) s'y trouve (seul le témoin `bases.source.json` est admis) ;
- une adresse e-mail n'est pas en `@example.com` (seul le `pnpm-lock.yaml` de la racine échappe à ce motif, pour les versions de paquets ; il passe par tous les autres).
Les fichiers non texte hors liste sont refusés plutôt que lus. Le refus tient dès la première faute, quel qu'en soit le nombre (pas de code de retour compté modulo 256). Le message donne `fichier:ligne` et le motif, jamais la valeur trouvée.

Après la recopie réelle, la destination repasse par ses propres gardes : `node scripts/garde.mjs` (règle sortante, traces privées) dans le dépôt public, et la garde externe des bases `scripts/garde-bases-externe.mjs` avec ses variables d'environnement, comme d'habitude. Le script lui-même ne fait aucun appel réseau.

## Jamais de suppression
Un fichier présent dans la destination mais absent de la source est conservé et signalé (« absent de la source (gardé) »). Pour le retirer, le faire à la main, en PR.

## Preuve
Sans contrôle automatique dans le dépôt privé, la preuve est l'essai intégré, sans IA ni réseau, sur des bases fictives : `scripts/publier-public.sh --essai`. Son résultat est collé dans la PR et relu par un relecteur Opus.

## Limite acceptée
Une variable secrète écrite en clé JSON entre guillemets (`"SESSION_SECRET": "…"`) n'est pas reconnue, ni par ce script ni par `scripts/garde.mjs` (même trou des deux côtés). Accepté tel quel : `scripts/garde.mjs` n'est pas modifié ici.

Locale : le script passe en `LC_ALL=C.UTF-8` quand cette locale existe, pour que « élodie » soit reconnu comme « Élodie ». Sans cette locale sur la machine, le repli des lettres accentuées en minuscule n'a pas lieu (limite acceptée ; l'essai le signale). Accepté aussi : un nom tout en capitales collé à un autre (`DUPONTELLE` pour `Dupontel`) est refusé par prudence, même si c'est un autre mot. Les fichiers compressés renommés sous une extension d'image ou de police sont reconnus à leur en-tête : gzip, zip, bzip2, xz, zstd.

Autres limites acceptées : le cas d'essai « l'arbre passe la garde » lit la copie de travail et non `git archive` ; `Elodie` sans accent et `É` en NFD (forme décomposée) ne sont pas reconnus pour `Élodie`.
