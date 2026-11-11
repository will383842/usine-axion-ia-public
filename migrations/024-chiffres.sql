-- 024 · Demandes par mot et par réseau (tâche T14).
-- Interrupteurs de l'écran « Chiffres » et de sa carte hebdomadaire : éteints. Rejouable.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('chiffres', 'Écran « Chiffres »', 'Le tableau saisi chaque semaine par mot et par compte, le rapport abonnés gagnés contre demandes de guide, l''objectif de visibilité de chaque compte.', false),
  ('ma-journee.releve-mot', 'Carte « Relever les chiffres du mot »', 'Montre, dans Ma journée, une fois par semaine, un rappel de saisir les chiffres de chaque mot.', false)
ON CONFLICT (code) DO NOTHING;
