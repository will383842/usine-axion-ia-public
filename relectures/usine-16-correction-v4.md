# Correction PR 16 (L7-32) · v4

Tête de usine/L7-32 : 0f65c4647f929a9e229e9197a45810ccd9e12575 (vérifiée par git ls-remote ; elle était 734229488d8aaebf02293857dfbe6e044248904f).

- Point 1 (bloquant) : espaces et BOM UTF-8 retirés de chaque nom. Essais « Nom1 | Nom2 » et « liste avec BOM ».
- Point 2 : nom en tête (`nomJean`, `NomJean`) ou en capitales collées.
- Point 3 : voisins de bases/ à la racine refusés (sauf bases.source.json).
- Point 4 : en-tête vérifié même avec extension permise (gzip, zip, signature PNG).
- Point 5 : noté comme accepté dans docs/DEPOT-PUBLIC.md, scripts/garde.mjs inchangé.
- Point 6 (doc répétée) corrigé au passage.

`bash scripts/publier-public.sh --essai` : VERT. Chaque correctif rougit sous mutation (6 mutations, toutes rouges). L'arbre du dépôt passe sa propre garde.
