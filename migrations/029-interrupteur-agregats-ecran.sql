-- Écran « Mots en commentaire » (lecture seule des chiffres agrégés reçus du CRM), livré éteint.
-- Migration ADDITIVE ; rejouable : une valeur posée par Will n'est jamais écrasée.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('agregats.ecran', 'Écran « Mots en commentaire »', 'Montre, pour chaque mot, les chiffres agrégés reçus (demandes, e-mails confirmés, guides envoyés) par jour et par compte. Lecture seule, aucune donnée de personne.', false)
ON CONFLICT (code) DO NOTHING;
