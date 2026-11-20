-- U-INTERRUPTEURS-MANQUANTS : les interrupteurs que le code lit déjà (interrupteurAllume) sans qu'aucune migration ne crée leur ligne.
-- Sans ligne, ils étaient « éteints » par défaut ; avec elle, Will peut les voir et les allumer dans les réglages. Tous livrés ÉTEINTS.
-- Migration ADDITIVE ; rejouable : une ligne qui existe déjà n'est jamais touchée (l'état posé par le fondateur n'est jamais réécrit).
-- Non créés, car non lus dans la table : TIRAGE_POIDS_MESURES (variable d'environnement, pas une ligne) et campagnes (code déclaré, lu nulle part).
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('studio.sortant', 'Envois vers le Studio', 'Allumé : l''Usine peut envoyer ses commandes au Studio (si le secret sortant est posé). Éteint : rien ne part.', false),
  ('horloge.semaine', 'Semaine proposée chaque semaine', 'Allumé : l''Usine propose d''elle-même la semaine au Studio, une fois par semaine. Éteint : rien n''est proposé tout seul.', false),
  ('journal', 'Journal d''activité', 'Allumé : vous voyez l''écran du journal de ce que l''Usine a fait.', false)
ON CONFLICT (code) DO NOTHING;
