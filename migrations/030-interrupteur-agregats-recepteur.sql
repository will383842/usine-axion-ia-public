-- Récepteur des chiffres agrégés du CRM Pro (POST /api/agregats-crm et GET des jours reçus), livré ÉTEINT.
-- Migration ADDITIVE ; rejouable : une valeur posée par Will n'est jamais écrasée. Éteint, la route répond 404 et n'écrit rien.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('agregats.recepteur', 'Réception des chiffres du CRM', 'Reçoit chaque jour les chiffres agrégés envoyés par le CRM (comptages par mot, compte et jour, sans aucune donnée de personne) et dit au CRM quels jours sont déjà reçus. Éteint : la porte reste fermée.', false)
ON CONFLICT (code) DO NOTHING;
