# RETRAIT-YOUTUBE-DEFAUT · youtube-shorts hors des réseaux par défaut
- Raison : Zernio refuse YouTube, aucune chaîne YouTube n'est reliée.
- Fait : `RESEAUX_PAR_DEFAUT` (src/tirage/charger.ts) = instagram, facebook. Types, profils de sortie et Studio inchangés ; `youtube-shorts` reste un réseau valide si on le demande.
- Tests : tests/tirage.test.ts (attente mise à jour, nouveau test de la liste).
