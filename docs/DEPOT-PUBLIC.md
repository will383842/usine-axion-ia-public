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
`bases/` (à toute profondeur), `.git`, `node_modules`, `.env` et `.env.*` (sauf `.env.exemple`), clés (`*.pem`, `*.key`, `*.p12`, `id_rsa*`, `id_ed25519*`), sorties de build (`.next`, `out`, `build`, `coverage`), `ALERTE-BASES.txt`.

## Garde anti-fuite (avant toute copie)
Le script prépare la copie dans un dossier de passage, la contrôle, et ne touche à la destination que si tout est propre. Refus (code 1, rien copié) si :
- un fichier de `bases/` s'y trouve ;
- un lien symbolique s'y trouve ;
- un secret probable apparaît (mêmes familles que `scripts/garde.mjs` : clés privées, jetons, hachages, adresses de base avec mot de passe, variables secrètes) ;
- le dépôt privé des plans est nommé quelque part (règle L7-02) ;
- une adresse e-mail n'est pas en `@example.com`.
Le message donne `fichier:ligne` et le motif, jamais la valeur trouvée.

Après la recopie réelle, la destination repasse par ses propres gardes : `node scripts/garde.mjs` (règle sortante, traces privées) dans le dépôt public, et la garde externe des bases `scripts/garde-bases-externe.mjs` avec ses variables d'environnement, comme d'habitude. Le script lui-même ne fait aucun appel réseau.

## Jamais de suppression
Un fichier présent dans la destination mais absent de la source est conservé et signalé (« absent de la source (gardé) »). Pour le retirer, le faire à la main, en PR.

## Preuve
Sans contrôle automatique dans le dépôt privé, la preuve est l'essai intégré, sans IA ni réseau, sur des bases fictives : `scripts/publier-public.sh --essai`. Son résultat est collé dans la PR et relu par un relecteur Opus.
