-- L3d · Chiffres agrégés du CRM, reçus par POST /api/agregats-crm (ADR contrat v3 d'origine, § 5 et corrections B1 à B4, I5).
-- Migration ADDITIVE : trois tables nouvelles, rien n'est modifié ni retiré. Aucune donnée de personne : des comptes de
-- chiffres par mot, compte et jour. Rien n'est jamais supprimé : on ajoute des lignes, la lecture prend la plus récente.

-- agregat_crm_nonce : un nonce vu par la route. Gardés sans fin (≈ 1 push par jour) ; seule la fenêtre de 10 minutes
-- compte pour refuser un rejeu (la route ne regarde que `vu_le` récent).
CREATE TABLE IF NOT EXISTS agregat_crm_nonce (
  id bigserial PRIMARY KEY,
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 16 AND 128),
  vu_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agregat_crm_nonce_recent ON agregat_crm_nonce (nonce, vu_le);

-- agregat_crm : AJOUT SEUL. Un renvoi ajoute des lignes portant un `genere_le` plus récent ; la lecture prend, par
-- (jour, compte, mot), la ligne au `genere_le` le plus récent. Une valeur NULL est une cellule masquée (« <3 »).
CREATE TABLE IF NOT EXISTS agregat_crm (
  id bigserial PRIMARY KEY,
  jour date NOT NULL,
  compte text NOT NULL,
  mot text NOT NULL,
  reseau text NOT NULL,
  demandes integer CHECK (demandes IS NULL OR demandes >= 3),
  guides_envoyes integer CHECK (guides_envoyes IS NULL OR guides_envoyes >= 3),
  accords integer CHECK (accords IS NULL OR accords >= 3),
  mises_a_l_ecart integer CHECK (mises_a_l_ecart IS NULL OR mises_a_l_ecart >= 3),
  genere_le timestamptz NOT NULL,
  recu_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jour, compte, mot, genere_le)
);
CREATE INDEX IF NOT EXISTS agregat_crm_lecture ON agregat_crm (jour, compte, mot, genere_le DESC);

-- agregat_crm_dernier : le dernier `genere_le` reçu pour (jour, compte). Un push plus ancien est refusé, un push égal
-- répond 2xx sans effet.
CREATE TABLE IF NOT EXISTS agregat_crm_dernier (
  jour date NOT NULL,
  compte text NOT NULL,
  genere_le timestamptz NOT NULL,
  PRIMARY KEY (jour, compte)
);
