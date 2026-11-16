# Reprise de l'existant : inventaire des écrans et règles

Fiche : UO-06. Ce document ne change aucun écran : il dit ce que devient chacun des écrans de `src/app/*` au profit de la v3 (menu à six lignes, `src/components/gabarit/navigation.ts`).

## Règles de reprise

1. **Rien n'est supprimé.** Pas de suppression de fichier d'écran ni de ligne de base ; retirer = `etat = 'retire'` ou `archive_le`.
2. **Un ancien écran est éteint par son interrupteur, jamais effacé.** Son adresse reste valable : soit elle montre l'écran éteint (`EcranEteint`), soit elle redirige vers son nouvel onglet (comme `/chiffres` et `/nouveautes`).
3. **Le retrait effectif des anciens écrans et du menu relève de UO-01** ; cette fiche ne fait que l'inventaire et le journal.
4. **Tout reste livré éteint** : un écran nouveau lit son interrupteur, éteint par défaut.
5. **Le journal est en lecture seule** (`/journal`, `src/journal/index.ts`) : aucune écriture au chargement, les modules y écrivent déjà par `journaliser()`.
6. **Posts publiés hors usine** : ils ne sont pas repris ici, voir L7-24 (`src/calendrier/*`).

## Inventaire des écrans actuels

| Adresse (`src/app/…`) | Devenir | Détail | Fiche |
|---|---|---|---|
| `(accueil)` (Ma journée) | gardé | première ligne du menu | UO-02 |
| `lots`, `lots/nouveau`, `lots/[id]`, `lots/deja-fabrique` | gardé | « Mes vidéos » | UO-02 |
| `calendrier` | gardé | « Mon calendrier » | L7-24 |
| `sujets` | gardé | « Mes idées de sujets » (métiers et nouveautés en onglets) | UO-01 |
| `metiers`, `metiers/[code]` | fusionné | dans « Mes idées de sujets » ; l'adresse reste | UO-01 |
| `nouveautes` | fusionné | redirige vers `/sujets?onglet=nouveautes` | UO-01 |
| `mots` | gardé | « Mes mots et cadeaux » (demandes et mots en commentaire en onglets) | UO-01 |
| `chiffres` | fusionné | redirige vers `/mots?onglet=demandes` | UO-01 |
| `commenter` | gardé | « Ma communauté » | UO-01 |
| `reglages` et ses sous-pages (`bases`, `comptes`, `interrupteurs`, `mot-de-passe`, `oppositions`, `parts`, `quotas`, `rythmes`, `tirage`) | gardé | sous « Réglages », en bas du menu | UO-01 |
| `connexion` | gardé | hors gabarit | — |
| `journal` | nouveau | lecture seule, éteint par défaut (interrupteur `journal`) | UO-06 |
| `api/*` (`agregats-crm`, `porte`, `sante`) | gardé | pas des écrans | — |
| `not-found.tsx`, `globals.css`, `polices` | gardé | gabarit | — |

Aucun écran n'est à retirer par cette fiche. Un écran qu'une fiche suivante voudrait retirer passe d'abord par l'interrupteur éteint, puis seulement par une fiche dédiée.

## À savoir

- L'interrupteur `journal` n'a pas de ligne en base tant qu'une migration ne l'a pas posée : un interrupteur absent vaut « éteint ». Aucune migration dans cette fiche ; la ligne et l'entrée de menu s'ajoutent avec UO-01.
- Les clés `email`, `telephone` et `nom` des données d'une ligne du journal sont masquées à l'affichage.
