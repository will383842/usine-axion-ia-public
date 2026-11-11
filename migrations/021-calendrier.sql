-- 021 · Calendrier simple (tâche T11).
-- Interrupteurs de l'écran « Calendrier » et de ses deux cartes de « Ma journée » : tous éteints.
-- Rejouable : INSERT ... ON CONFLICT DO NOTHING.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('calendrier', 'Écran « Calendrier »', 'Les contenus des lots répartis par jour et par réseau selon vos rythmes, avec les trous et le rappel des parts.', false),
  ('ma-journee.calendrier-trou', 'Carte « Trou dans la semaine »', 'Montre, dans Ma journée, un réseau qui n''a pas assez de publications prévues cette semaine.', false),
  ('ma-journee.commentaires-linkedin', 'Carte « Commentaires LinkedIn à traiter »', 'Montre, dans Ma journée, un rappel dans l''heure qui suit une publication LinkedIn prévue.', false)
ON CONFLICT (code) DO NOTHING;
