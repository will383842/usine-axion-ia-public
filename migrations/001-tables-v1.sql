-- 001 · Toutes les tables de la version 1 (tâche T01).
-- Règles : jamais de suppression (retirer = etat 'retire' ou archive_le) ; noms de usine/CONTRATS-ECHANGE.md.
-- Rejouable : CREATE ... IF NOT EXISTS et INSERT ... ON CONFLICT DO NOTHING.

-- ============================================================================
-- 1. Les tables des bases (bases/pour-la-machine/, « ## table: »).
--    Colonnes reprises telles quelles, en texte ; les listes séparées par « ; » restent du texte.
--    Colonnes de l'Usine ajoutées : importe_le, cree_le, modifie_le ; metier.allume (l'interrupteur
--    du métier, posé par Will dans l'Usine, jamais écrit par l'import ; « actif » garde la valeur des bases).
--    La table « compte » des bases n'est pas importée (contrat § 2) : voir « compte » plus bas.
-- ============================================================================

-- secteur : bases/pour-la-machine/1-cibles.md
CREATE TABLE IF NOT EXISTS secteur (
  code text PRIMARY KEY,
  nom text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- metier : bases/pour-la-machine/1-cibles.md
CREATE TABLE IF NOT EXISTS metier (
  code text PRIMARY KEY,
  numero text,
  secteur text,
  nature text,
  nom text,
  se_nomment text,
  mots text,
  veut_vraiment text,
  ne_jamais_dire text,
  tailles_typiques text,
  actif text,
  profondeur text,
  calcule text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  allume boolean NOT NULL DEFAULT false,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- public : bases/pour-la-machine/1-cibles.md
CREATE TABLE IF NOT EXISTS public (
  code text PRIMARY KEY,
  nom text,
  se_nomment text,
  mots text,
  veut_vraiment text,
  ne_jamais_dire text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- douleur : bases/pour-la-machine/1-cibles.md
CREATE TABLE IF NOT EXISTS douleur (
  code text PRIMARY KEY,
  cible text,
  dite text,
  scene_avant text,
  cout text,
  services text,
  tailles text,
  type_contenu text,
  calcule text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- objection : bases/pour-la-machine/1-cibles.md
CREATE TABLE IF NOT EXISTS objection (
  code text PRIMARY KEY,
  cible text,
  objection text,
  reponse text,
  service text,
  ou_l_utiliser text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- souci_releve : bases/pour-la-machine/1-cibles.md
CREATE TABLE IF NOT EXISTS souci_releve (
  code text PRIMARY KEY,
  numero text,
  cible text,
  souci text,
  source text,
  force text,
  lu_le text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- taille : bases/pour-la-machine/2-tailles.md
CREATE TABLE IF NOT EXISTS taille (
  code text PRIMARY KEY,
  nom text,
  effectif text,
  qui_decide text,
  comment_parler text,
  ce_qui_change text,
  mots text,
  ne_jamais_dire text,
  offres text,
  reseaux_privilegies text,
  poids text,
  actif text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- famille : bases/pour-la-machine/3-sujets.md
CREATE TABLE IF NOT EXISTS famille (
  code text PRIMARY KEY,
  nom text,
  suivi text,
  rythme_cible text,
  public text,
  toujours_valide_par_will text,
  dans_les_lots text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- sujet : bases/pour-la-machine/3-sujets.md
CREATE TABLE IF NOT EXISTS sujet (
  code text PRIMARY KEY,
  famille text,
  titre text,
  de_quoi text,
  public text,
  nourri_par text,
  serie_studio text,
  types_contenu text,
  interdits_propres text,
  actif text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- actualite : bases/pour-la-machine/3-sujets.md
CREATE TABLE IF NOT EXISTS actualite (
  code text PRIMARY KEY,
  titre text,
  ce_qui_change_pour_un_dirigeant text,
  source text,
  date_source text,
  perime_le text,
  retenue text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- cas_usage : bases/pour-la-machine/4-cas-d-usage.md
CREATE TABLE IF NOT EXISTS cas_usage (
  code text PRIMARY KEY,
  numero text,
  cible text,
  service text,
  sorte text,
  titre text,
  probleme text,
  etapes text,
  ce_que_ca_change text,
  reste_humain text,
  douleurs text,
  posture text,
  faits text,
  offre text,
  sujet text,
  formats_conseilles text,
  phare text,
  accroche text,
  appuye_sur text,
  cas_origine text,
  calcule text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- format_video : bases/pour-la-machine/5-formats.md
CREATE TABLE IF NOT EXISTS format_video (
  code text PRIMARY KEY,
  code_classement text,
  nom text,
  statut text,
  tournage text,
  duree text,
  reseaux_conseilles text,
  squelette text,
  en_lot text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- format_autre : bases/pour-la-machine/5-formats.md
CREATE TABLE IF NOT EXISTS format_autre (
  code text PRIMARY KEY,
  proprietaire text,
  squelette text,
  longueur_min text,
  longueur_max text,
  contient_appel text,
  validation text,
  etat_service text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- publication : bases/pour-la-machine/6-reseaux.md
CREATE TABLE IF NOT EXISTS publication (
  code text PRIMARY KEY,
  reseau text,
  type text,
  ratio text,
  duree_conseillee text,
  duree_max text,
  accroche text,
  legende_max text,
  legende_visible text,
  mots_diese text,
  lien_cliquable text,
  premier_commentaire text,
  mot_permis text,
  rythme_max_semaine text,
  ecart_min_h text,
  publieur text,
  lu_le text,
  relire text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- appel : bases/pour-la-machine/7-appels.md
CREATE TABLE IF NOT EXISTS appel (
  code text PRIMARY KEY,
  reseaux text,
  cible text,
  type_contenu text,
  type text,
  objectif text,
  dit text,
  ecran text,
  legende text,
  mot text,
  lien text,
  emplacement text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- voix : bases/pour-la-machine/8-voix-et-interdits.md
CREATE TABLE IF NOT EXISTS voix (
  code text PRIMARY KEY,
  regle text,
  pourquoi text,
  s_applique_a text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- interdit : bases/pour-la-machine/8-voix-et-interdits.md
CREATE TABLE IF NOT EXISTS interdit (
  code text PRIMARY KEY,
  expression text,
  remplacement text,
  raison text,
  portee text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- fait : bases/pour-la-machine/8-voix-et-interdits.md
CREATE TABLE IF NOT EXISTS fait (
  code text PRIMARY KEY,
  enonce text,
  source text,
  date text,
  portee text,
  perime_le text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- accroche : bases/pour-la-machine/9-accroches.md
CREATE TABLE IF NOT EXISTS accroche (
  code text PRIMARY KEY,
  famille text,
  modele text,
  exemple text,
  ne_pas_faire text,
  reseaux text,
  types_contenu text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  importe_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. Les tables de l'Usine.
-- ============================================================================

-- service : formation · audit · coaching · integration (lignes de départ posées par T02).
CREATE TABLE IF NOT EXISTS service (
  code text PRIMARY KEY CHECK (code ~ '^[a-z_]+$'),
  nom text NOT NULL,
  serie_studio text,
  passage_site text,
  ordre integer NOT NULL DEFAULT 0,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- compte : comptes réels (« <reseau>:<identifiant> »), tenus par l'Usine (lignes de départ posées par T02).
CREATE TABLE IF NOT EXISTS compte (
  code text PRIMARY KEY CHECK (code ~ '^[a-z-]+:[a-z0-9._-]+$'),
  reseau text NOT NULL CHECK (reseau IN ('linkedin', 'instagram', 'facebook', 'tiktok', 'youtube', 'youtube-shorts')),
  identifiant text NOT NULL,
  nature text NOT NULL CHECK (nature IN ('profil', 'page', 'compte')),
  nom text,
  publieur text,
  lien_profil text,
  objectif_visibilite text,
  actif boolean NOT NULL DEFAULT false,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  version text,
  origine text,
  source text,
  valide_le text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- reglage : clé → valeur JSON (parts par format et par réseau, poids, rythmes, plafond par défaut…).
CREATE TABLE IF NOT EXISTS reglage (
  cle text PRIMARY KEY,
  valeur jsonb NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

-- interrupteur : tout est livré éteint ; un code absent vaut « éteint ».
CREATE TABLE IF NOT EXISTS interrupteur (
  code text PRIMARY KEY,
  nom text NOT NULL,
  description text,
  allume boolean NOT NULL DEFAULT false,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- journal : tout ce qui change, ajouté au bout, jamais modifié.
CREATE TABLE IF NOT EXISTS journal (
  id bigserial PRIMARY KEY,
  le timestamptz NOT NULL DEFAULT now(),
  sujet text NOT NULL,
  cible text,
  message text NOT NULL,
  donnees jsonb
);
CREATE INDEX IF NOT EXISTS journal_sujet_le ON journal (sujet, le);
CREATE INDEX IF NOT EXISTS journal_cible ON journal (cible);

-- refus : les six raisons d'un refus (tenues dans l'Usine).
CREATE TABLE IF NOT EXISTS refus (
  code text PRIMARY KEY,
  nom text NOT NULL,
  ordre integer NOT NULL DEFAULT 0,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);
INSERT INTO refus (code, nom, ordre) VALUES
  ('hors_cible', 'Sujet hors cible', 1),
  ('deja_vu', 'Déjà vu', 2),
  ('faux_ou_douteux', 'Faux ou douteux', 3),
  ('accroche_faible', 'Accroche faible', 4),
  ('voix_ou_rythme', 'Voix ou rythme', 5),
  ('image', 'Image', 6)
ON CONFLICT (code) DO NOTHING;

-- lot : « L<n> » ; le plafond en euros est obligatoire et vaut accord de dépense.
CREATE SEQUENCE IF NOT EXISTS lot_numero;
CREATE TABLE IF NOT EXISTS lot (
  id text PRIMARY KEY CHECK (id ~ '^L[0-9]+$'),
  numero integer NOT NULL UNIQUE,
  nombre integer NOT NULL CHECK (nombre BETWEEN 3 AND 30),
  plafond_eur numeric(10, 2) NOT NULL CHECK (plafond_eur > 0),
  reglages jsonb NOT NULL DEFAULT '{}'::jsonb,
  etat text NOT NULL DEFAULT 'brouillon' CHECK (etat IN ('brouillon', 'commande')),
  commande_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- lot_ligne : « L<n>-<m> » ; un contenu (pas forcément une vidéo), ses réseaux et sa fin par réseau.
CREATE TABLE IF NOT EXISTS lot_ligne (
  id text PRIMARY KEY CHECK (id ~ '^L[0-9]+-[0-9]+$'),
  lot text NOT NULL REFERENCES lot (id),
  rang integer NOT NULL,
  type_contenu text NOT NULL CHECK (type_contenu IN ('video', 'carrousel', 'image', 'texte', 'story')),
  format text,
  public text NOT NULL DEFAULT 'public.clients',
  metier text REFERENCES metier (code),
  taille text REFERENCES taille (code),
  service text REFERENCES service (code),
  douleur text REFERENCES douleur (code),
  cas_usage text REFERENCES cas_usage (code),
  sujet text REFERENCES sujet (code),
  actualite text REFERENCES actualite (code),
  accroche text REFERENCES accroche (code),
  structure text,
  reseaux text[] NOT NULL DEFAULT '{}',
  fins jsonb NOT NULL DEFAULT '{}'::jsonb,
  repere text NOT NULL CHECK (repere ~ '^usine:L[0-9]+-[0-9]+$'),
  cout_max_eur numeric(10, 2) NOT NULL DEFAULT 0 CHECK (cout_max_eur >= 0),
  paquet jsonb,
  etat text NOT NULL DEFAULT 'a_coller' CHECK (etat IN ('a_coller', 'collee', 'fabriquee', 'publiee', 'refusee')),
  code_version text,
  refus text REFERENCES refus (code),
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz,
  UNIQUE (lot, rang),
  CHECK ((etat = 'refusee') = (refus IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lot_ligne_lot ON lot_ligne (lot);

-- cadeau : code = valeur de GuideRequest.aimant du site (« guide-ia »).
CREATE TABLE IF NOT EXISTS cadeau (
  code text PRIMARY KEY CHECK (code ~ '^[a-z0-9-]+$'),
  nom text NOT NULL,
  document text,
  version text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  valide_le text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- mot : un mot par cadeau ; « mot-<mot en minuscules> ».
CREATE TABLE IF NOT EXISTS mot (
  code text PRIMARY KEY CHECK (code ~ '^mot-[a-z0-9-]+$'),
  mot text NOT NULL UNIQUE,
  cadeau text REFERENCES cadeau (code),
  outil text NOT NULL DEFAULT 'zernio',
  automatisations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordre integer NOT NULL DEFAULT 0,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- mot_texte : les textes d'un mot (réponse publique, messages, boutons…), versionnés ;
-- « à valider » = etat 'propose' ; jamais en service sans être validé.
CREATE TABLE IF NOT EXISTS mot_texte (
  id bigserial PRIMARY KEY,
  mot text NOT NULL REFERENCES mot (code),
  nature text NOT NULL,
  reseau text NOT NULL DEFAULT 'tous',
  rang integer NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  texte text NOT NULL,
  source text,
  etat text NOT NULL DEFAULT 'propose' CHECK (etat IN ('brouillon', 'propose', 'valide', 'retire')),
  valide_le text,
  en_service boolean NOT NULL DEFAULT false,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz,
  UNIQUE (mot, nature, reseau, rang, version),
  CHECK (NOT en_service OR etat = 'valide')
);

-- mot_branche : « branché » = essai réussi, textes validés, automatisation ouverte à tout le compte.
-- Instagram et Facebook seulement. compte vide = tous les comptes du réseau (contrat § 7).
CREATE TABLE IF NOT EXISTS mot_branche (
  id bigserial PRIMARY KEY,
  mot text NOT NULL REFERENCES mot (mot),
  reseau text NOT NULL CHECK (reseau IN ('instagram', 'facebook')),
  compte text NOT NULL DEFAULT '',
  etat text NOT NULL DEFAULT 'non_branche' CHECK (etat IN ('non_branche', 'branche')),
  le date NOT NULL DEFAULT current_date,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz,
  UNIQUE (mot, reseau, compte)
);

-- opposition : STOP commun ; jamais retirée. cle = empreinte d'adresse (jamais l'adresse) ou « <reseau>:<compte> ».
CREATE TABLE IF NOT EXISTS opposition (
  id bigserial PRIMARY KEY,
  cle text NOT NULL,
  canal text NOT NULL CHECK (canal IN ('instagram', 'facebook', 'email', 'tous')),
  depuis timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('zernio-stop', 'site', 'will')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cle, canal)
);

-- carte : les cartes de « Ma journée » (un verbe, un bouton).
CREATE TABLE IF NOT EXISTS carte (
  id bigserial PRIMARY KEY,
  cle text UNIQUE,
  titre text NOT NULL,
  detail text,
  bouton text NOT NULL,
  lien text,
  urgence integer NOT NULL DEFAULT 0,
  interrupteur text,
  origine text,
  echeance timestamptz,
  fait_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- compte_a_suivre : les comptes chez qui Will commente (aucun envoi, aucun texte écrit à sa place).
CREATE TABLE IF NOT EXISTS compte_a_suivre (
  code text PRIMARY KEY CHECK (code ~ '^[a-z-]+:[a-z0-9._-]+$'),
  reseau text NOT NULL CHECK (reseau IN ('linkedin', 'instagram', 'facebook', 'tiktok', 'youtube', 'youtube-shorts')),
  nom text NOT NULL,
  lien text,
  note text,
  propose_le date,
  fait_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);

-- calendrier_ligne : ce qui est prévu, par jour, par réseau et par type de contenu.
CREATE TABLE IF NOT EXISTS calendrier_ligne (
  id bigserial PRIMARY KEY,
  lot_ligne text REFERENCES lot_ligne (id),
  reseau text NOT NULL CHECK (reseau IN ('linkedin', 'instagram', 'facebook', 'tiktok', 'youtube', 'youtube-shorts')),
  compte text REFERENCES compte (code),
  type_contenu text NOT NULL CHECK (type_contenu IN ('video', 'carrousel', 'image', 'texte', 'story')),
  format text,
  prevue_le timestamptz NOT NULL,
  etat text NOT NULL DEFAULT 'brouillon' CHECK (etat IN ('brouillon', 'programmee', 'publiee', 'echec')),
  note text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz
);
CREATE INDEX IF NOT EXISTS calendrier_ligne_prevue ON calendrier_ligne (prevue_le);

-- releve_mot : les chiffres d'un mot saisis chaque semaine, par compte (T14).
CREATE TABLE IF NOT EXISTS releve_mot (
  id bigserial PRIMARY KEY,
  semaine date NOT NULL,
  mot text NOT NULL REFERENCES mot (code),
  compte text NOT NULL REFERENCES compte (code),
  commentaires integer NOT NULL DEFAULT 0 CHECK (commentaires >= 0),
  messages integer NOT NULL DEFAULT 0 CHECK (messages >= 0),
  demandes_guide integer NOT NULL DEFAULT 0 CHECK (demandes_guide >= 0),
  abonnes_gagnes integer NOT NULL DEFAULT 0 CHECK (abonnes_gagnes >= 0),
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  archive_le timestamptz,
  UNIQUE (semaine, mot, compte)
);
