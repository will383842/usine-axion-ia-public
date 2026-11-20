-- U-SECOND-CODE-ETEINT : interrupteur qui commande l'EXIGENCE du second code à la connexion, livré ÉTEINT.
-- Éteint : le mot de passe seul ouvre la session (comme avant la 027). Allumé : le second code par application
-- (téléphone enregistré, codes de secours) est imposé. Les téléphones déjà enregistrés ne sont jamais touchés.
-- Migration ADDITIVE ; rejouable : l'état posé par le fondateur n'est jamais réécrit.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('connexion.second-code', 'Second code à la connexion', 'Allumé : après le mot de passe, l''Usine demande un second code. Pour l''instant, il passe par une application d''authentification sur votre téléphone (la version par courriel viendra). Éteint : le mot de passe seul suffit.', false)
ON CONFLICT (code) DO NOTHING;
