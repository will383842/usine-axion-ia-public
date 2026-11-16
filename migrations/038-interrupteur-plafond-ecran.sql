-- PLAFOND-USINE-b : interrupteur de l'ÉCRAN « Plafond des achats automatiques », livré ÉTEINT.
-- Ce n est pas un interrupteur des achats automatiques : aucune ligne de ce genre n existe dans l Usine.
-- Migration ADDITIVE ; rejouable : l'état posé par le fondateur n'est jamais réécrit.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('plafond.ecran', 'Plafond des achats automatiques', 'Allumé : vous pouvez régler le plafond du mois et l''envoyer au Studio. Les achats automatiques restent éteints : vous seul pourrez les allumer.', false)
ON CONFLICT (code) DO NOTHING;
