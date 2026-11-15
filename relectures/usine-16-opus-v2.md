# Relecture PR 16 (L7-32) · v2

VERDICT PROVISOIRE : en cours

Tête relue : b03bb41d9e1c032dc609135e92f052601a7d71bf (attendue d83ae176 ; un commit de plus, b03bb41, poussé après).

## Avancement
- [x] Diff : 2 fichiers (scripts/publier-public.sh, docs/DEPOT-PUBLIC.md), essai intégré `--essai` VERT.
- [x] Sonde du verdict 1 (256 adresses réelles) : BLOQUÉE (code 1, rien copié). 512 et 256 fautes mixtes : bloquées.
- [x] Sondes de contournement : voir verdict (UTF-16, gzip, noms de fichiers, adresse de base, identifiants de noms).
- [x] Arbre réel de la PR en à blanc : refusé (le script se bloque lui-même, ligne 204) ; 12 fichiers légitimes écartés.
- [ ] CI.
