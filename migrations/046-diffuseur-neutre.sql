-- Libellé neutre du diffuseur : `publieur` valait le nom de l'ancien outil, qui a changé ; il vaut désormais `diffuseur`.
-- Seuls `publieur` et la source de départ sont réécrits : `actif` et `etat` (posés par le fondateur) ne bougent jamais.
-- Migration ADDITIVE (aucune ligne retirée) ; rejouable : une 2e exécution ne trouve plus rien à changer.
UPDATE compte SET publieur = 'diffuseur' WHERE publieur = 'buffer';
UPDATE compte SET source = 'Six comptes de départ reliés au 12/10 ; CONTRATS-ECHANGE.md § 1 (compte.code)'
 WHERE source = 'Buffer, six comptes reliés au 12/10 ; CONTRATS-ECHANGE.md § 1 (compte.code)';
