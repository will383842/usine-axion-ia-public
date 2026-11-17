# usine-axion-ia

Usine Axion : choix des sujets, lots, mots, cadeaux, calendrier, chiffres (à côté du studio). Code seul.

- Démarrer en local : `pnpm install`, variables de `.env.exemple` dans `.env.local`, puis `pnpm dev`.
- Mot de passe : `pnpm hacher` affiche la valeur de `USINE_PASSWORD_HASH_B64` (à régler sur le serveur, jamais dans le dépôt).
- Vérifier : `pnpm verifier` (types, lint, garde, tests, build). Les tests de base exigent `DATABASE_URL` (PostgreSQL 16).
- Les bases de contenu (`bases/`) sont privées et absents de ce dépôt : sans elles, les essais qui les lisent sont sautés et l'application démarre avec des tables vides.
- Mise en ligne : le job `deployer` (`.github/workflows/ci.yml`) ne tourne jamais sur une PR, seulement sur `main` ou à la main ; sans les secrets de déploiement dans l'environnement `usine-production`, il finit en échec avec un message clair. `/api/sante` donne la version du code (`USINE_VERSION`, posée à la construction de l'image). `bases/` n'entre pas dans l'image : le serveur le pose en volume, en lecture seule ; absent, le démarrage le dit dans une ligne de journal et continue.
- Le déploiement, les secrets et le serveur sont décrits dans un dépôt privé. Aucune valeur secrète n'est jamais écrite ici.

Consignes des sessions : `CLAUDE.md`.
