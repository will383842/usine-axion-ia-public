-- U-COMMANDE : les lignes du calendrier proposées au Studio, et l'état que le Studio en rend.
-- Migration ADDITIVE ; rejouable : l'interrupteur posé par le fondateur n'est jamais réécrit. Aucune colonne de montant.
CREATE TABLE IF NOT EXISTS commande_studio (
  cle text PRIMARY KEY,
  calendrier_ligne bigint NOT NULL UNIQUE REFERENCES calendrier_ligne (id),
  lot_ligne text REFERENCES lot_ligne (id),
  repere text,
  reseau text NOT NULL,
  compte text NOT NULL,
  type_contenu text NOT NULL,
  jour date NOT NULL,
  instant timestamptz NOT NULL,
  etat_envoi text NOT NULL DEFAULT 'a_envoyer'
    CHECK (etat_envoi IN ('a_envoyer', 'envoyee', 'mise_de_cote_studio', 'non_envoyee')),
  etat_studio text CHECK (etat_studio IN ('recue', 'mise_de_cote', 'a_valider', 'programmee', 'publiee', 'refusee', 'echec', 'manquee', 'archivee')),
  valide_le timestamptz,
  refuse_le timestamptz,
  message text,
  envoyee_le timestamptz,
  relue_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);
CREATE INDEX IF NOT EXISTS commande_studio_etat ON commande_studio (etat_envoi, relue_le);
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('commandes.studio', 'Échanges avec le Studio', 'Allumé : vous pouvez proposer une ligne du calendrier au Studio et relire son état. Rien ne part tout seul.', false)
ON CONFLICT (code) DO NOTHING;
