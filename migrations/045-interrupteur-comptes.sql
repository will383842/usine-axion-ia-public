-- CPT-A : interrupteur de l'écran « Mes comptes » qui permet d'allumer ou d'éteindre un compte, livré ÉTEINT.
-- Éteint : l'écran montre seulement le lien du profil de chaque compte, sans état ni bouton.
-- Aucun compte n'est touché par cette migration : les six comptes restent éteints tant que le fondateur n'a rien fait.
-- Migration ADDITIVE ; rejouable : l'état posé par le fondateur n'est jamais réécrit.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('comptes.actif', 'Allumer ou éteindre un compte', 'Allumé : dans Réglages › « Mes comptes », chaque compte montre s''il est actif et un bouton pour l''allumer ou l''éteindre. Seul un compte actif est pris pour proposer la semaine. Éteint : rien ne change.', false)
ON CONFLICT (code) DO NOTHING;
