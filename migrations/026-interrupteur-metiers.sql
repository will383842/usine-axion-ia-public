-- T06 · Interrupteur de l'écran « Métiers », livré éteint.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('metiers', 'Écran « Métiers »', 'Liste des métiers par secteur : allumer ou éteindre un métier, voir ses points à trancher, le valider.', false)
ON CONFLICT (code) DO NOTHING;
