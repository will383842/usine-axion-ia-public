# Relecture PR 17 (UO-01, coquille v3 de l'Usine)

**VERDICT : À CORRIGER**, sur la tête complète `e62c7f32a385b5d41dd832f36c5ad60507e635e5` (PR en brouillon).

## À corriger

1. `src/lib/etats-contenu.ts:32` : la phrase de l'état « Corbeille », « retiré tout seul au bout de 30 jours », contredit la décision du 15/11 (corbeille avec suppression définitive après double vérification) et la maquette validée (« supprimer pour de bon après confirmation écrite »). Elle affiche aussi un chiffre qu'aucun code de ce dépôt ne porte (la règle « aucun chiffre inventé dans un texte d'écran » s'applique). Remplacer par exemple par : « Mis de côté. Rien n'est effacé sans votre confirmation écrite. »
2. `src/app/globals.css:67-68` : en thème sombre, l'anneau de focus clavier `var(--terracotta)` (#f0762f) ne contraste qu'à 1,86:1 avec la barre bleu ciel, qui ne change pas de couleur, et à 2,86:1 avec le fond blanc de l'élément actif ou du bouton « Chercher une page ». Le seuil WCAG 1.4.11 est de 3:1 : au clavier, on ne voit plus où l'on est dans la barre. En clair, le contraste vaut 3,77:1 et passe. Il faut poser un focus propre à la barre (par exemple `outline-color: var(--barre-texte)` dans `aside` et dans le menu « Plus »), ou un jeton `--focus` comme dans la maquette.
3. `src/components/gabarit/RechercheCtrlK.tsx:45` : la fenêtre se déclare `aria-modal`, mais Tab sort vers la page derrière (aucun piège de focus, page non `inert`) et le focus ne revient pas sur l'élément de départ à la fermeture (l. 27 et 31). De plus, la ligne choisie aux flèches n'est signalée que par `aria-current` sur un bouton qui n'a pas le focus : un lecteur d'écran ne l'annonce pas. Il manque `role="combobox"` / `listbox` / `option` avec `aria-activedescendant`.

## Remarques non bloquantes

- La fiche UO-01 n'existe que dans la sauvegarde du 11/11, avec `statut: suspendu`, `fichiers_autorises: []` et des critères non écrits. Le périmètre a été pris de la consigne de lancement (noté dans la PR). Les 11 fichiers touchés restent dans le périmètre d'origine de N-02 (gabarit, ui, thèmes, dictionnaire des états, plus un essai) : rien hors sujet.
- Il n'y a pas de cloche dans l'en-tête, alors que la maquette v5 met les alertes par la cloche seule. Ce n'est pas dans le titre de la fiche, mais c'est à prévoir dans la coquille ou dans une fiche suivante.
- `Gabarit.tsx:26` : le thème est posé dans un `useEffect`, ce qui fait un éclair clair au chargement pour qui a choisi le sombre.
- `BarreLaterale.tsx:42` : la touche affichée est « Ctrl K » même sur Mac (le code accepte Cmd K).
- `etats-contenu.ts` : un code inconnu retombe en silence sur « Brouillon ». Le libellé est « Texte à valider » au lieu de « Script à valider » (v3), ce qui est plus clair pour un novice et acceptable.
- Thème et recherche ne passent pas par un interrupteur ; les couleurs de page changent pour tous les écrans. Ce choix est assumé dans la PR et conforme à la maquette validée.

## Sondes faites (clone neuf)

- Les 12 états sont identiques à la liste v3 (Brouillon … Corbeille), dans l'ordre. Le plein ne s'applique qu'à « programmé » et « publié », et « validé » se distingue de « programmé ».
- Contrastes en clair : texte de la barre 10,9:1, phrases de la barre (80 %) 6,6:1, texte doux sur page 6,05:1, bouton principal 5,47:1. En sombre : texte doux 9,07:1 et 7,84:1, bouton 6,74:1. Tout est conforme, hors l'anneau de focus (point 2).
- Ctrl K / Cmd K, les flèches, Entrée et Échap sont relus dans le code (aucun contrôle dans un navigateur).
- Filtres : quatre réseaux pris dans `RESEAUX` du contrat, familles déduites des types du contrat, aucun nom nouveau.
- Aucun appel réseau, aucun `fetch`, aucun DELETE/TRUNCATE/DROP, aucune donnée retirée, aucun nom de personne dans le diff ni dans les commits. `localStorage` est seulement lu et écrit sous try/catch.
- `vitest tests/coquille-v3.test.ts` : 13/13 verts. `node scripts/garde.mjs` : 0.
- Contrôles GitHub sur la tête : « Types, lint, garde, tests, build » réussi, « Image Docker » réussi, « Envoi au serveur » ignoré (normal hors de main).
