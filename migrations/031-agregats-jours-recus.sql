-- Récepteur des chiffres agrégés du CRM Pro : marqueur « jour reçu », en AJOUT SEUL.
-- Un push dont toutes les lignes sont masquées n'écrit aucune ligne de chiffres ; sans ce marqueur, le jour ne serait pas
-- rendu par le GET et le CRM le renverrait pendant 7 jours. Migration ADDITIVE : une table nouvelle, rien n'est modifié.
CREATE TABLE IF NOT EXISTS agregat_crm_jour_recu (
  jour date PRIMARY KEY,
  recu_le timestamptz NOT NULL DEFAULT now()
);
