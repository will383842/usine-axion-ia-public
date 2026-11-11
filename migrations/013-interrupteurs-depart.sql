-- T03 · Interrupteurs de départ de « Ma journée » : tous éteints (Will les allume dans Réglages › Interrupteurs).
-- Rejouable : INSERT ... ON CONFLICT DO NOTHING (une valeur posée par Will n'est jamais écrasée).
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('ma-journee.metiers-sans-contenu', 'Carte « Métiers allumés sans contenu »', 'Montre, dans Ma journée, les métiers que vous avez allumés et qui n''ont encore aucun contenu commandé.', false),
  ('ma-journee.nouveautes', 'Carte « Nouveautés de la semaine à garder »', 'Montre, dans Ma journée, les nouveautés proposées qu''il reste à garder ou à laisser.', false),
  ('ma-journee.a-faire-par-vous', 'Carte « À faire par vous »', 'Montre, dans Ma journée, les vidéos prêtes à coller dans l''écran du studio.', false)
ON CONFLICT (code) DO NOTHING;
