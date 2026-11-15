# Relecture PR 17 (UO-01, coquille v3), troisième passe

**VERDICT : OK — FUSION POSSIBLE** sur la tête complète `a138bfe7a6b868bb0ba1bc9b1f91ee52af668176`.

## Point bloquant de la v2 (Ctrl K inerte) : résolu

`src/components/gabarit/RechercheCtrlK.tsx:34` : l'exclusion se fait maintenant par `!frere.contains(fenetre.current)`, la fenêtre (enfant direct de `body` par le portail) n'est plus mise en `inert`.

Sonde dans Chromium (composant réel compilé par rolldown, routeur simulé ; une `nav` en plus comme autre enfant de `body`), clavier réel de Playwright :
- Ctrl K : la fenêtre s'ouvre, le focus est sur le champ, aucun ancêtre `[inert]` ; 2 éléments inertes (la `nav` et la racine de la page) ; on peut taper dans le champ.
- Tab : champ → Fermer → champ ; Maj+Tab : champ → Fermer. Le piège tient.
- Entrée sur « Fermer » : la fenêtre se ferme, **aucune navigation**, plus aucun élément inerte, le focus revient sur le bouton de départ.
- Échap : ferme, même retour du focus et de la page.
- Entrée dans le champ : ouvre la page choisie (une navigation), puis ferme.
- Après fermeture, un clic sur un champ de la page fonctionne. Aucune erreur dans la console.

Sonde jsdom (essai jetable, non commité) : mêmes résultats, plus Cmd K, `aria-activedescendant` qui pointe vers une option existante, flèche bas puis Entrée = une navigation. Remarque : jsdom ne met pas en œuvre `inert` (simple propriété, sans attribut ni effet), d'où la sonde Chromium.

L'essai ajouté `tests/recherche-ctrlk.test.ts` **échoue** sur le composant de la tête précédente (263761a) et passe sur la tête : il couvre bien le défaut.

## Les deux autres points restent résolus

Le diff 263761a..a138bfe ne touche ni `src/lib/etats-contenu.ts` (Corbeille) ni `src/app/globals.css` (focus de la barre en sombre). Les constats de la v2 restent valables.

## Périmètre

- Diff complet de la PR : 14 fichiers. Les 11 de la fiche (déjà acceptés en v1/v2), plus `tests/recherche-ctrlk.test.ts`, `package.json` (`jsdom` en dépendance de développement seulement) et `pnpm-lock.yaml`. Ces trois ajouts découlent directement de la remarque de la v2 sur l'essai qui ne lisait que le source ; ils ne touchent ni au code livré ni à la production. Non bloquant.
- Aucun nom de personne dans le diff ni dans les messages de commit. Aucun appel réseau, aucun DELETE/TRUNCATE/DROP.
- `node scripts/garde.mjs` : 0. `vitest tests/coquille-v3.test.ts tests/recherche-ctrlk.test.ts` : 17/17 verts.
- Contrôles GitHub sur a138bfe (= `refs/pull/17/head`), tous terminés : « Types, lint, garde, tests, build » réussi, « Image Docker » réussi, « Envoi au serveur » ignoré (normal hors de main).
