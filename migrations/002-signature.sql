-- 002 · Signature d'un contenu et « déjà fabriqué » (tâche T08, PLAN-MAITRE A.3 point 13 bis).
-- Signature = métier + taille + service + douleur + cas + format + famille d'accroche (fonction signature()
-- de src/tirage/). Une signature déjà commandée ou déjà fabriquée n'est jamais retirée : l'unicité vaut aussi
-- pour les lignes refusées ou archivées.
-- Rejouable : ADD COLUMN IF NOT EXISTS, CREATE ... IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING.

ALTER TABLE lot_ligne ADD COLUMN IF NOT EXISTS signature text;
CREATE UNIQUE INDEX IF NOT EXISTS lot_ligne_signature ON lot_ligne (signature);

-- deja_fabrique : les contenus faits hors de l'Usine (ou avant elle), pour qu'ils ne soient pas refaits.
-- Même forme que la signature ; « sujet » ou « actualite » quand le contenu ne part pas d'un cas (saisie de T09).
CREATE TABLE IF NOT EXISTS deja_fabrique (
  id bigserial PRIMARY KEY,
  type_contenu text NOT NULL DEFAULT 'video' CHECK (type_contenu IN ('video', 'carrousel', 'image', 'texte', 'story')),
  metier text REFERENCES metier (code),
  taille text REFERENCES taille (code),
  service text REFERENCES service (code),
  douleur text REFERENCES douleur (code),
  cas_usage text REFERENCES cas_usage (code),
  sujet text,
  actualite text,
  format text,
  structure text,
  signature text NOT NULL UNIQUE,
  code_version text,
  fabrique_le date NOT NULL DEFAULT current_date,
  note text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- Interrupteurs du tirage : éteints (Will les allume dans Réglages › Interrupteurs).
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('tirage', 'Tirage des contenus', 'Choisit les contenus d''un lot parmi les métiers allumés, sans jamais refaire un contenu déjà commandé ou déjà fabriqué.', false),
  ('tirage.fin-rendez-vous', 'Fin « rendez-vous » au tirage', 'Permet au tirage de choisir une fin qui invite à réserver un diagnostic (page /fr/appel).', false)
ON CONFLICT (code) DO NOTHING;

-- Délai avant qu'un même cas revienne dans un autre format (jours).
INSERT INTO reglage (cle, valeur) VALUES ('tirage.delai_cas_jours', '30'::jsonb)
ON CONFLICT (cle) DO NOTHING;
