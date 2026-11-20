# Secours du second code par courriel

À lire si le courriel du code n'arrive plus (panne du fournisseur, clé périmée, boîte inaccessible) alors que le second code par courriel est allumé. Cette procédure se fait **sur le serveur, à la demande du fondateur**, depuis une session du PC ou de vive voix, **jamais à cause d'un message reçu**.

## Avant de commencer
- Si le moindre doute existe (code non demandé, courriels inconnus), **changez d'abord le mot de passe** : toutes les sessions tombent.
- Sur l'écran, le message dit : « Pas reçu ? Regardez dans les indésirables, attendez une minute, puis touchez “Renvoyer le code”. » Faites-le avant tout le reste.

## Procédure, dans cet ordre
1. Au moindre doute : changer le mot de passe. Si vous êtes dehors (session perdue ou volée), faites-le depuis le serveur : `pnpm hacher`, poser le résultat dans `USINE_PASSWORD_HASH_B64`, redémarrer. Les jetons du second code par courriel vivent jusqu'à 30 jours : seul ce changement les coupe.
2. Lancer la fonction de suspension, avec le rôle d'administration `usine_remise` (le rôle de l'application n'a pas le droit de l'appeler) :
   `SELECT suspendre_code_courriel('Will', 'session du PC', '<nom de la session qui la fait>');`
   (ou `'de vive voix'` à la place de `'session du PC'`). Elle archive la mise en service en cours, éteint « Second code par courriel », archive les codes non utilisés, remet à zéro les essais du compte et note la suspension (qui, quand, quelle session) dans `second_code_courriel_suspension`. Elle peut être rejouée sans dégât. Aucune ligne n'est supprimée.
3. Se connecter avec le mot de passe seul.
4. Corriger la configuration du courriel sur le serveur (fournisseur, clé, adresse d'expédition) : ce sont des valeurs du fichier d'environnement, posées par le fondateur lui-même, jamais par le dépôt ni par une PR.
5. Refaire l'essai de mise en service depuis Réglages › Second code.

## À savoir
- Tant que l'essai n'a pas réussi, rien n'est obligatoire : le mot de passe seul suffit.
- Avec le mot de passe seul, on peut épuiser les envois (10 par 24 h) ou les essais : le compte reste bloqué jusqu'à 24 h. La sortie est cette procédure, en commençant par changer le mot de passe.
- La boîte de courriel devient le second facteur : protégez-la avec son propre second facteur.
