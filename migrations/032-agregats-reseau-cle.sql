LOCK TABLE agregat_crm, agregat_crm_dernier IN EXCLUSIVE MODE;

-- Chiffres agrégés du CRM : un même nom de compte peut exister sur deux réseaux (« Axion » sur instagram, « axion » sur linkedin).
-- La clé d'unicité passe de (jour, compte, mot, genere_le) à (jour, reseau, compte, mot, genere_le).
-- Migration ADDITIVE : aucune suppression, aucune donnée perdue. Postgres ne permet pas d'élargir une contrainte unique
-- sans retirer l'ancienne ; la règle du dépôt interdit tout retrait. On crée donc les NOUVELLES tables d'abord, on y copie
-- toutes les lignes, puis on met les anciennes de côté par un simple renommage (elles restent intactes en base, lisibles).

-- 1. Nouvelles tables (noms provisoires), clé élargie au réseau.
CREATE TABLE agregat_crm_nouvelle (
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
  CONSTRAINT agregat_crm_cle_reseau UNIQUE (jour, reseau, compte, mot, genere_le)
);
CREATE TABLE agregat_crm_dernier_nouvelle (
  jour date NOT NULL,
  reseau text NOT NULL,
  compte text NOT NULL,
  genere_le timestamptz NOT NULL,
  PRIMARY KEY (jour, reseau, compte)
);

-- 2. Copie de toutes les lignes existantes (un compte n'avait jusqu'ici qu'un seul réseau : la jointure est exacte).
INSERT INTO agregat_crm_nouvelle (id, jour, compte, mot, reseau, demandes, guides_envoyes, accords, mises_a_l_ecart, genere_le, recu_le)
  SELECT id, jour, compte, mot, reseau, demandes, guides_envoyes, accords, mises_a_l_ecart, genere_le, recu_le FROM agregat_crm;
INSERT INTO agregat_crm_dernier_nouvelle (jour, reseau, compte, genere_le)
  SELECT d.jour, r.reseau, d.compte, d.genere_le
    FROM agregat_crm_dernier d JOIN (SELECT DISTINCT compte, reseau FROM agregat_crm) r ON r.compte = d.compte;
SELECT setval(pg_get_serial_sequence('agregat_crm_nouvelle', 'id'), GREATEST((SELECT COALESCE(max(id), 0) FROM agregat_crm_nouvelle), 1));

-- 3. Mise de côté des anciennes tables (renommées, non modifiées) et prise de leur nom par les nouvelles.
ALTER TABLE agregat_crm RENAME TO agregat_crm_avant_032;
ALTER TABLE agregat_crm_dernier RENAME TO agregat_crm_dernier_avant_032;
ALTER TABLE agregat_crm_nouvelle RENAME TO agregat_crm;
ALTER TABLE agregat_crm_dernier_nouvelle RENAME TO agregat_crm_dernier;
CREATE INDEX agregat_crm_lecture_reseau ON agregat_crm (jour, reseau, compte, mot, genere_le DESC);
