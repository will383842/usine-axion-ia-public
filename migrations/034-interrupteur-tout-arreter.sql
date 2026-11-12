-- U-ARRET · « Tout arrêter » : interrupteur d'arrêt général, livré NON arrêté (allume = false).
-- Allumé, il arrête tout envoi, tout appel sortant et toute commande automatique (réponses automatiques comprises) ; il n'efface rien.
-- Migration ADDITIVE ; rejouable : l'état posé par Will n'est jamais écrasé. La reprise n'a lieu que sur son geste.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('arret.tout', 'Tout arrêter', 'Allumé : plus aucun envoi, aucun appel vers l''extérieur et aucune commande automatique, réponses automatiques comprises. Rien n''est effacé. La reprise se fait par un geste de Will, jamais au redémarrage.', false)
ON CONFLICT (code) DO NOTHING;
