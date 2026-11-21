-- Plan #63 · interrupteur « Carrousels dans la semaine proposée », livré ÉTEINT.
-- Éteint : la semaine proposée au Studio ne compte que des vidéos, comme avant. Allumé : elle compte aussi des carrousels (LinkedIn, Instagram, Facebook).
-- Migration ADDITIVE ; rejouable : l'état posé par le fondateur n'est jamais réécrit.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('semaine.carrousels', 'Carrousels dans la semaine proposée', 'Allumé : la semaine proposée au Studio compte aussi des carrousels (LinkedIn, Instagram, Facebook), autant que le quota carrousel du réseau. Rien n''est publié sans votre validation dans le Studio. Éteint : vidéos seulement.', false)
ON CONFLICT (code) DO NOTHING;
