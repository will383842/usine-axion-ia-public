-- 049 · Réserve de tutoriels : pause croissante quand la commande au Studio est refusée (additive, rejouable).
-- Compte les envois refusés d'une ligne de tutoriel et note l'heure avant laquelle on ne renvoie pas. Aucune suppression.
ALTER TABLE tutoriel_tirage ADD COLUMN IF NOT EXISTS commande_essais integer NOT NULL DEFAULT 0;
ALTER TABLE tutoriel_tirage ADD COLUMN IF NOT EXISTS commande_prochaine_le timestamptz;
