-- 048 · Réserve de tutoriels : interrupteur livré ÉTEINT et suivi des tirages demandés au Studio.
-- Éteint : rien ne part, la semaine proposée ne change pas. Allumé : une fois par semaine, l'Usine demande au Studio de prendre
-- le tutoriel suivant de la réserve ; le créneau n'est posé qu'une fois la vidéo « à valider ». Rien n'est publié sans le fondateur.
-- Migration ADDITIVE ; rejouable : l'état posé par le fondateur n'est jamais réécrit. Aucune colonne de montant.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('tutoriel.reserve', 'Tutoriels pris dans la réserve du Studio', 'Allumé : une fois par semaine, l''Usine demande au Studio de préparer le tutoriel suivant de votre réserve, puis propose un créneau quand la vidéo est à valider. Rien n''est publié sans votre validation dans le Studio. Éteint : rien ne part.', false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS tutoriel_tirage (
  cle text PRIMARY KEY CHECK (cle ~ '^[a-z0-9-]{8,94}$'),
  lundi date NOT NULL,
  essai integer NOT NULL CHECK (essai >= 1),
  reseau text NOT NULL,
  etat_tirage text NOT NULL DEFAULT 'demande' CHECK (etat_tirage IN ('demande', 'pris', 'echec')),
  etat_studio text CHECK (etat_studio IN ('pris', 'fait', 'a_revoir', 'en_reserve')),
  element_id text,
  video_id text,
  raison text,
  a_valider_le timestamptz,
  calendrier_ligne bigint UNIQUE REFERENCES calendrier_ligne (id),
  demandee_le timestamptz,
  relue_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz,
  UNIQUE (lundi, essai)
);
CREATE UNIQUE INDEX IF NOT EXISTS tutoriel_tirage_un_actif ON tutoriel_tirage (lundi)
  WHERE archive_le IS NULL AND etat_tirage <> 'echec' AND (etat_studio IS NULL OR etat_studio IN ('pris', 'fait'));
