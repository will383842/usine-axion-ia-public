-- UO-04 · écrans de suivi : case « Sur le site » des vidéos, et interrupteurs des écrans, livrés ÉTEINTS.
-- Migration ADDITIVE (aucune colonne retirée, aucune ligne supprimée) ; rejouable : l'état posé par le fondateur n'est jamais réécrit.
-- Décocher ne supprime rien : la date du retrait est notée et une ligne est ajoutée au journal.
ALTER TABLE lot_ligne ADD COLUMN IF NOT EXISTS sur_le_site boolean NOT NULL DEFAULT false;
ALTER TABLE lot_ligne ADD COLUMN IF NOT EXISTS sur_le_site_retire_le timestamptz;

INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('suivi', 'Écrans de suivi', 'Allumé : vous voyez la fiabilité, les formats sans vidéo, les vidéos sur le site, les prospects en chiffres et les STOP. Écrans de lecture : rien n''est envoyé.', false),
  ('veille', 'Alerte de silence', 'Allumé : l''Usine signale quand la semaine n''a pas été proposée au Studio ou quand le Studio ne répond pas depuis plus de 24 h.', false)
ON CONFLICT (code) DO NOTHING;
