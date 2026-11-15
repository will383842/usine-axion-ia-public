-- UO-07 · Historique des relevés : chaque saisie ou correction d'un relevé ajoute une ligne, la valeur précédente n'est jamais perdue.
-- Interrupteur « reservations » (lecture des réservations du site), livré éteint.
-- Migration ADDITIVE ; rejouable : une valeur posée par le fondateur n'est jamais écrasée.
CREATE TABLE IF NOT EXISTS releve_mot_historique (
  id bigserial PRIMARY KEY,
  semaine date NOT NULL,
  mot text NOT NULL REFERENCES mot (code),
  compte text NOT NULL REFERENCES compte (code),
  commentaires integer NOT NULL DEFAULT 0 CHECK (commentaires >= 0),
  messages integer NOT NULL DEFAULT 0 CHECK (messages >= 0),
  demandes_guide integer NOT NULL DEFAULT 0 CHECK (demandes_guide >= 0),
  abonnes_gagnes integer NOT NULL DEFAULT 0 CHECK (abonnes_gagnes >= 0),
  saisi_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS releve_mot_historique_cle ON releve_mot_historique (mot, compte, semaine, saisi_le);

INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('reservations', 'Réservations du site', 'Lit, depuis le site, le nombre de réservations par lien de suivi et par semaine. Des nombres seulement, aucune donnée de personne.', false)
ON CONFLICT (code) DO NOTHING;
