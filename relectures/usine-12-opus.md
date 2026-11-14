# Relecture PR 12 · U-QUOTA (tête 570ac44e)

**Verdict : À CORRIGER** (corrections courtes ; la PR est en brouillon et ne peut de toute façon pas être fusionnée avant l'accord du fondateur, voir « Ce qui bloque »).

Base réelle de la PR : `main` (pas `master`). Diff relu : `git diff origin/main...origin/usine/U-QUOTA`.

## Vérifications faites
- Fichiers touchés : exactement `src/reglages/quotas.ts`, `src/reglages/index.ts`, `src/app/reglages/quotas/page.tsx`, `src/app/reglages/actions.ts`, `src/app/reglages/page.tsx`, `tests/quotas.test.ts`, `pilotage/journal/U-QUOTA.md`. **`src/reglages/modele.ts` non touché.** Conforme.
- Aucun nom de personne dans le diff (« fondateur » seulement, dans la PR). Aucun `DELETE`/`TRUNCATE`, aucune suppression de données ; aucun appel sortant ; aucun prix ni « € » dans un texte d'écran.
- Quotas en quantités entières (0 à 99), par `jour` ou `semaine` (« mois » refusé), par réseau (6) et par type (vidéo, carrousel, infographie = `image`). Relus à chaque appel (`lireQuotas`), modifiables (`enregistrerQuotas`, session exigée, journalisée).
- Corps de la porte : `z.strictObject` à quatre clés (`reseau`, `type_contenu`, `quantite`, `periode`), test sur le schéma (clés + refus d'un champ en plus `plafond_eur` / `centimes`). Conforme.
- Paliers 50/80/100 % et projection en fonctions pures ; commande `main` toujours « passe » ; au-delà de 100 % une commande automatique est `mise_de_cote`, il n'existe aucune issue « refusée ».
- Page signalée brouillon : commentaire `src/app/reglages/quotas/page.tsx:12`, journal, corps de PR (en gras). Rien à l'écran (acceptable pour un brouillon).
- Relancé localement avec PostgreSQL 16 : `tests/quotas.test.ts` 13/13 ; suite entière 35 fichiers, 399/399 ; `next typegen && tsc --noEmit` 0 ; `eslint .` 0 ; `node scripts/garde.mjs` 0 ; `next build` 0.

## À corriger
1. **`src/reglages/quotas.ts:129` · le déblocage ne débloque rien.** `debloquer()` change seulement `etat` ; `decider()` (`:102`) ne connaît pas l'état `debloquee`. Quand U-COMMANDE renverra une commande débloquée par `decider(..., "automatique")`, elle sera de nouveau mise de côté tant que le quota est plein : le « débloquable d'un clic » n'est pas tenu. Corriger : une origine `"debloquee"` (ou `decider` qui accepte une `MiseDeCote`) traitée comme `main`, avec un test qui fait passer une commande débloquée à 100 % atteint.
2. **`tests/quotas.test.ts:85-86` · test quasi tautologique.** Il vérifie un spread `{...m, etat}`. À remplacer par le test du point 1 (débloquée + quota plein → `passe`).
3. **`tests/quotas.test.ts:106` · test tautologique.** Compare une constante à sa propre valeur littérale ; le `satisfies` le garantit déjà au typage. Le retirer, ou vérifier l'appartenance à `TYPES_CONTENU`.
4. **`src/app/reglages/quotas/page.tsx:21` · texte d'écran qui promet une action absente.** « vous la débloquez d'un clic » : aucun écran de déblocage n'existe (stockage des mises de côté renvoyé à U-COMMANDE). Retirer cette phrase tant que le bouton n'existe pas.
5. **`src/reglages/quotas.ts:134` · nom d'échange nouveau hors contrat.** `corpsCommandeSchema` est un corps destiné à la porte, posé dans `src/reglages/` sans ligne dans `CONTRATS-ECHANGE.md` ni dans `src/contrats/` / `docs/CONTRAT-PORTE.md` (règle « Noms »). Soit le déplacer dans `src/contrats/` avec la ligne de contrat, soit le marquer explicitement interne jusqu'à U-COMMANDE (noté dans la PR).

## Points mineurs (non bloquants)
- `src/app/reglages/actions.ts:108` : une période inconnue reçue du formulaire devient « jour » en silence au lieu d'une erreur ; préférer `retour(..., "Un quota se règle par jour ou par semaine.")` via `verifierQuota`.
- `src/reglages/quotas.ts:54` : `Number(null)`, `Number("")`, `Number(true)` donnent 0 ou 1, donc une valeur illisible peut être gardée au lieu de retomber sur le départ. Exiger `typeof quantite === "number"`.
- `src/reglages/quotas.ts:112` : `repartir` saute une grosse demande et laisse passer une petite qui suit (ordre non strict). Rien n'est perdu ; à noter pour U-COMMANDE.
- `decider` n'impose pas `quantite > 0` : une demande de 0 ou négative « passe ».
- `tests/quotas.test.ts:129` : `DROP SCHEMA` de nettoyage, comme `tests/arret.test.ts` et `tests/agregats-crm.test.ts` ; schéma d'essai seulement, pratique déjà en place.
- Page sans interrupteur, comme les autres réglages du tirage (`rythmes`, `parts`) : cohérent, mais « tout est livré éteint » n'est pas lu ici.

## Ce qui bloque la fusion
- **Accord du fondateur nécessaire : oui.** La PR est un brouillon (draft) et l'écran dépend de la maquette (RC-03) non validée ; l'agent ne fusionne pas.
- **RC-03 (maquette)** : bloque l'écran définitif, pas les fonctions pures. Fusion possible du réglage seul si le fondateur accepte le brouillon.
- **RC-02** : fiche faite côté plans (journal RC-09), rien à fusionner ici ; à confirmer par le fondateur que les seuils et valeurs de départ (vidéo 1/jour, Instagram 2, carrousel 1/semaine, infographie 2/semaine) sont bien ceux de la fiche.
- **NEW-ARG-03** : non visible dans ce dépôt public ; s'il porte la règle « jamais d'euros vers la porte » ou le choix jour/semaine, le fondateur doit confirmer. Le code ne crée aucune dépendance technique vers lui.
- Après les points 1 à 5 : rien de technique ne bloque (CI locale verte, `mergeable_state: clean`).
