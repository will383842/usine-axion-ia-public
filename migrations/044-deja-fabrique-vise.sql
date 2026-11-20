-- 044 · Jour et réseau visés d'un sujet retenu au studio. Migration ADDITIVE et rejouable : deux colonnes nullables, aucune contrainte nouvelle.
ALTER TABLE deja_fabrique ADD COLUMN IF NOT EXISTS vise_le date;
ALTER TABLE deja_fabrique ADD COLUMN IF NOT EXISTS vise_reseau text;
