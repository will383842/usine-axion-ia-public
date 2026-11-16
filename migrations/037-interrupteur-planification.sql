-- U-PLANIF : interrupteur de l'écran « Ma semaine », livré ÉTEINT.
-- Migration ADDITIVE ; rejouable : l'état posé par le fondateur n'est jamais réécrit.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('planification', 'Ma semaine', 'Allumé : l''Usine propose les jours de publication de la semaine (sans IA, d''après vos rythmes et vos quotas) et vous pouvez les envoyer au Studio, où ils restent « à valider ». Rien n''est publié sans votre validation.', false)
ON CONFLICT (code) DO NOTHING;
