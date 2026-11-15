# Relecture usine PR 15 et PR 16 (Opus)

VERDICT PROVISOIRE : en cours

## Avancement
- Têtes : PR 15 `usine/L7-01` = 537fdcf745c13c928d3cbb40e8e1c3392ffbe329 ; PR 16 `usine/L7-32` = 71ab9f2867cae15c5b30a7eb7428540a70ecb00a (base commune main 9bf7958).
- Périmètre : PR 15 touche seulement `.github/workflows/ci.yml` ; PR 16 seulement `scripts/publier-public.sh` et `docs/DEPOT-PUBLIC.md`. Conforme aux fiches.
- PR 16 : essai intégré `--essai` VERT. Rejeu de fuites jetables (non poussées) : faux secret bloqué ; fichier propre passe ; faux nom de personne PASSE ; 256 fautes PASSENT (code de retour modulo 256).
