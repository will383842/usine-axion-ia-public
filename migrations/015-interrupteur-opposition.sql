-- T05 · Interrupteur de l'écran « Réglages › Oppositions », livré éteint.
-- La lecture des oppositions (estOpposee) ne dépend d'aucun interrupteur : elle reste toujours active.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('opposition', 'Oppositions', 'Écran « Réglages › Oppositions » : ajouter à la main une personne qui ne veut plus rien recevoir.', false)
ON CONFLICT (code) DO NOTHING;
