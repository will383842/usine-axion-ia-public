# Correction PR 16 (L7-32) · v5

Tête de la branche usine/L7-32 après correction : d23bb21a6aed6402ff47426d92b584f4f40e5b2c

- Point 1 (bloquant) : fin de ligne forcée après le fichier de noms. 4 cas d'essai (sans fin de ligne, un seul nom, avec la variable, nom de la variable). Mutation : 5 cas rouges.
- Point 2 : en-têtes bzip2, xz, zstd refusés sous extension permise et hors liste. 3 cas. Mutation : 2 cas rouges.
- Point 3 : LC_ALL=C.UTF-8 si la locale existe (sinon note dans la doc). 2 cas. Mutation : 3 cas rouges.
- Point 4 : accepté, noté dans docs/DEPOT-PUBLIC.md. Point 5 : report, non traité (hors fichiers autorisés).
- Essai : VERT. L'arbre du dépôt passe sa propre garde (292 fichiers). Aucun réseau, faux noms et faux secrets seulement.
