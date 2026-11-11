-- 020 · Le paquet à coller (tâche T10).
-- Interrupteur du paquet à l'écran d'un lot : éteint (Will l'allume dans Réglages › Interrupteurs).
-- Rejouable : INSERT ... ON CONFLICT DO NOTHING.

INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('lots.paquet', 'Paquet à coller au studio', 'Montre, pour chaque contenu commandé, les champs à copier dans l''écran « nouvelle vidéo » du studio, après contrôle des interdits, des nombres, des longueurs et du mot branché.', false)
ON CONFLICT (code) DO NOTHING;
