-- T12 · Interrupteur de l'écran « Commenter chez les autres » : éteint (Will l'allume dans Réglages › Interrupteurs).
-- Rejouable : une valeur posée par Will n'est jamais écrasée.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('commenter.allume', 'Écran « Commenter chez les autres »', 'Propose chaque jour sept comptes de votre liste chez qui commenter. Rien n''est envoyé, aucun texte n''est écrit à votre place.', false)
ON CONFLICT (code) DO NOTHING;
