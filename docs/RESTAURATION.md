# Restaurer la base de l'Usine

La base est sauvegardée chaque nuit à 2 h 30 UTC, soit 3 h 30 (hiver) ou 4 h 30 (été) à Paris : un fichier `usine-AAAA-MM-JJ.sql.gz.enc`, chiffré, rangé dans `/var/backups/usine` et déposé chez R2 sous `usine/`. Rien n'est jamais supprimé par ces scripts.

## Si la sauvegarde échoue
Un e-mail d'alerte part à l'adresse réglée dans `SAUVEGARDE_ALERTE_EMAIL`. Aucune notification sur téléphone. Relancez à la main : `deploiement/sauvegarder.sh`. Si le fichier du jour existe sans le fichier `.envoye` à côté, la relance refait seulement l'envoi chez R2 (pas de second dump). Sans adresse d'alerte, une ligne `ALERTE` reste dans `/var/log/usine-sauvegarde.log`.

## Restaurer, pas à pas
1. Récupérez le fichier voulu (dossier local du serveur, ou téléchargement depuis R2).
2. Lancez : `deploiement/restaurer-base.sh <fichier> <nom-de-la-base-neuve>`.
3. Le script refuse si la base existe déjà : il restaure toujours dans une base neuve, jamais par-dessus l'actuelle.
4. Vérifiez la base neuve (comptez quelques lignes), puis changez `DATABASE_URL` pour la pointer dessus et redémarrez l'application.
5. Gardez l'ancienne base telle quelle jusqu'à ce que vous soyez sûr du résultat.

## Réglages (sur le serveur, jamais dans le dépôt)
`SAUVEGARDE_ACTIVE` (à `1` pour allumer ; éteinte par défaut), `SAUVEGARDE_CONTENEUR`, `SAUVEGARDE_BASE`, `SAUVEGARDE_UTILISATEUR`, `SAUVEGARDE_DOSSIER`, `SAUVEGARDE_CLE_FICHIER` (fichier de la clé de chiffrement, à garder aussi hors du serveur), `SAUVEGARDE_ALERTE_EMAIL`, `R2_COMPTE`, `R2_BUCKET`, `R2_ID_ACCES`, `R2_SECRET`.

Sans la clé de chiffrement, une sauvegarde est illisible : conservez-la dans un second endroit sûr.
