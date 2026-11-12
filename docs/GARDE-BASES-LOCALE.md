# Garde d'écart des bases, en local

Le contrôle quotidien des bases ne passe plus par GitHub Actions. Un script local, sans IA, lance la comparaison existante (`scripts/garde-bases-externe.mjs`, non modifié) et vous alerte en cas d'écart.

## Ce que fait le script
- `scripts/garde-bases-locale.ps1` compare `bases.source.json` au manifeste de la source. Il n'écrit jamais dans `bases/`.
- Aucun écart : code de sortie 0. Écart, réglage absent ou manifeste illisible : code 1 et message clair.
- En cas d'écart, il pose `ALERTE-BASES.txt` dans `%LOCALAPPDATA%\GardeBases` (hors du dépôt) ; le fichier disparaît au retour au vert. Un journal `garde-bases.log` garde une ligne par passage.
- Le jeton n'est jamais affiché ni écrit : toute sortie est masquée avant d'être écrite.

## Réglages (variables d'environnement de votre session Windows)
`PLANS_PRIVE_LECTURE` (jeton de lecture seule), `PLANS_PRIVE_DEPOT`, `PLANS_PRIVE_MANIFESTE`. Noms dans `.env.exemple` ; les valeurs ne sont jamais dans le dépôt.
Prérequis : Node 22 ou plus, dépendances installées (`pnpm install`).

## Planifier (une seule fois)
Dans PowerShell : `scripts/planifier-garde-bases.ps1` (option `-Heure 08:00`). La tâche `GardeBasesUsine` tourne une fois par jour. Pour la retirer : `Unregister-ScheduledTask -TaskName GardeBasesUsine`.

## Si l'alerte apparaît
Lancez `scripts/synchroniser-bases.sh`, relisez `git diff bases/`, puis livrez.

## Remarque
La comparaison lit le manifeste de la source par la passerelle déjà déclarée ; le script ne fait aucun autre appel. `.github/workflows/bases-source.yml` reste en place mais inactif (Actions coupées) : à vous de dire s'il faut le retirer.
