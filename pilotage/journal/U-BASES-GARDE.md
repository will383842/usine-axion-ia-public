# U-BASES-GARDE · garde d'écart des bases en local · terminé
- Fait : scripts/garde-bases-locale.ps1 (lance garde-bases-externe.mjs non modifié ; 0 conforme, 1 écart ; alerte en fichier hors dépôt ; sortie masquée), scripts/planifier-garde-bases.ps1 (tâche quotidienne, NON exécuté), docs/GARDE-BASES-LOCALE.md, tests/garde-bases-locale.test.ts.
- Non fait : essai du .ps1 sous Windows (pas de PowerShell ici) ; les tests lisent le texte des scripts.
- Remarque : la comparaison appelle la passerelle bases-source (hôte déclaré) ; le script n'ajoute aucun autre appel. bases-source.yml laissé en place, inactif : à trancher par le fondateur.
