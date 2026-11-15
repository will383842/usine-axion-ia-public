-- L7-24 · Convergence du calendrier vers le Studio (additive : aucune donnée retirée ni modifiée).
-- etat_studio : dernier état lu du Studio, en lecture seule, distinct de l'état de l'usine.
ALTER TABLE calendrier_ligne ADD COLUMN IF NOT EXISTS etat_studio text CHECK (etat_studio IN ('en_attente', 'programmee', 'publiee', 'echec'));
ALTER TABLE calendrier_ligne ADD COLUMN IF NOT EXISTS etat_studio_le timestamptz;
-- date_choisie : vrai dès que le fondateur a choisi le jour ; la date par défaut ne la remplace jamais.
ALTER TABLE calendrier_ligne ADD COLUMN IF NOT EXISTS date_choisie boolean NOT NULL DEFAULT false;
-- Un contenu n'est placé qu'une fois par réseau, même si deux envois se croisent.
CREATE UNIQUE INDEX IF NOT EXISTS calendrier_ligne_unique_contenu ON calendrier_ligne (lot_ligne, reseau) WHERE lot_ligne IS NOT NULL AND archive_le IS NULL;
