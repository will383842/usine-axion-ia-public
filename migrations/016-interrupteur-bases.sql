-- T02 · Interrupteur de l'écran « Réglages › Bases », livré éteint.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('bases.recharger', 'Recharger les bases', 'Écran « Réglages › Bases » : relit les fichiers des bases et met à jour métiers, douleurs, cas, sujets, fins.', false)
ON CONFLICT (code) DO NOTHING;
