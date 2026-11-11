-- 023 · Nouveautés de la semaine (tâche T13).
-- Interrupteur de l'écran « Nouveautés » : éteint (Will l'allume dans Réglages › Interrupteurs).
-- Rejouable : INSERT ... ON CONFLICT DO NOTHING.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('nouveautes', 'Écran « Nouveautés »', 'Les nouveautés de la semaine, avec leur source : les garder (elles entrent au tirage) ou les écarter.', false)
ON CONFLICT (code) DO NOTHING;
