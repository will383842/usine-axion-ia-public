-- N-26 · Code par téléphone à la connexion (second code, application d'authentification, RFC 6238).
-- Rien n'est jamais retiré : un téléphone remplacé ou remis à zéro reçoit `archive_le`.

-- second_code : un téléphone enregistré. Le secret est CHIFFRÉ (AES-256-GCM, src/auth/chiffrement.ts), jamais en clair.
-- `dernier_pas` : le dernier pas de 30 s accepté (un code ne sert qu'une fois). Un seul téléphone confirmé et non archivé.
CREATE TABLE IF NOT EXISTS second_code (
  id bigserial PRIMARY KEY,
  secret_chiffre text NOT NULL,
  dernier_pas bigint,
  cree_le timestamptz NOT NULL DEFAULT now(),
  confirme_le timestamptz,
  archive_le timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS second_code_un_seul_actif ON second_code ((true)) WHERE confirme_le IS NOT NULL AND archive_le IS NULL;

-- second_code_secours : les codes de secours d'un téléphone, gardés HACHÉS (argon2id), chacun utilisable une fois.
CREATE TABLE IF NOT EXISTS second_code_secours (
  id bigserial PRIMARY KEY,
  second_code_id bigint NOT NULL REFERENCES second_code (id),
  hachage text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  utilise_le timestamptz
);
CREATE INDEX IF NOT EXISTS second_code_secours_code ON second_code_secours (second_code_id);

-- second_code_essais : une seule ligne, pour tout le compte. 5 essais faux de suite = une attente, qui s'allonge sur
-- les paliers de suite (`attentes_de_suite` : 15 min, puis 1 h, puis 24 h) ; un succès remet le palier à zéro.
CREATE TABLE IF NOT EXISTS second_code_essais (
  id integer PRIMARY KEY CHECK (id = 1),
  echecs integer NOT NULL DEFAULT 0,
  attente_jusqu_a timestamptz,
  attentes_de_suite integer NOT NULL DEFAULT 0
);
INSERT INTO second_code_essais (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- second_code_remise : chaque remise à zéro, notée (qui l'a demandée, quand, par quelle session).
-- `code_de_secours` : Will a utilisé un code de secours. `serveur` : une session ayant accès au serveur l'a faite à la
-- demande de Will, dans une session du PC ou de vive voix (jamais à cause d'un message reçu). Le journal d'activité
-- de N-24 reprendra cette trace. Aucune donnée du code ici.
CREATE TABLE IF NOT EXISTS second_code_remise (
  id bigserial PRIMARY KEY,
  faite_le timestamptz NOT NULL DEFAULT now(),
  moyen text NOT NULL CHECK (moyen IN ('code_de_secours', 'serveur')),
  demandee_par text NOT NULL CHECK (length(btrim(demandee_par)) > 0),
  demande_faite text CHECK (demande_faite IN ('session du PC', 'de vive voix')),
  session text,
  -- `jeton` : empreinte (HMAC, clé du serveur) du jti de la session partielle qui a utilisé le code de secours ; elle
  -- seule enregistre le nouveau téléphone (src/auth/second-code.ts).
  jeton text,
  second_code_id bigint REFERENCES second_code (id),
  CHECK (moyen = 'code_de_secours' OR (demande_faite IS NOT NULL AND length(btrim(coalesce(session, ''))) > 0))
);

-- Remise à zéro par le serveur, seulement à la demande de Will (session du PC ou de vive voix), par un rôle
-- d'administration (voir les droits plus bas, jamais le rôle de l'application). PROCÉDURE, dans cet ordre :
--   1) CHANGER LE MOT DE PASSE (nouveau hachage dans USINE_PASSWORD_HASH_B64 ou par l'écran, `pnpm hacher`) : les
--      sessions existantes, partielles comprises, tombent ; qui a fait échouer les codes connaît l'ancien ;
--   2) SELECT remettre_second_code('Will', 'session du PC', '<nom de la session qui la fait>');
-- Après la remise, seule une session partielle ouverte après elle enregistre un téléphone (src/auth/second-code.ts).
-- Archive tout téléphone enregistré (les sessions ouvertes sont coupées), remet les essais à zéro, note la remise.
-- À la connexion suivante, l'enregistrement d'un nouveau téléphone est imposé.
CREATE OR REPLACE FUNCTION remettre_second_code(p_demandee_par text, p_demande_faite text, p_session text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ancien bigint;
  v_id bigint;
BEGIN
  IF p_demande_faite IS NULL OR p_demande_faite NOT IN ('session du PC', 'de vive voix') THEN
    RAISE EXCEPTION 'Remise refusée : seulement à la demande de Will, dans une session du PC ou de vive voix.';
  END IF;
  PERFORM 1 FROM second_code_essais WHERE id = 1 FOR UPDATE;
  SELECT id INTO v_ancien FROM second_code WHERE confirme_le IS NOT NULL AND archive_le IS NULL;
  UPDATE second_code SET archive_le = now() WHERE archive_le IS NULL;
  UPDATE second_code_essais SET echecs = 0, attente_jusqu_a = NULL, attentes_de_suite = 0 WHERE id = 1;
  INSERT INTO second_code_remise (moyen, demandee_par, demande_faite, session, second_code_id)
    VALUES ('serveur', p_demandee_par, p_demande_faite, p_session, v_ancien)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Droits de la remise. SECURITY DEFINER : la fonction agit avec les droits de son propriétaire (le rôle qui joue les
-- migrations), le chemin de recherche est figé sur le schéma des tables (pas de détournement par un autre schéma).
-- EXECUTE est retiré à PUBLIC ET au propriétaire (le rôle de l'application) : seul `usine_remise` l'a.
-- `usine_remise` : rôle d'administration, NOLOGIN, sans mot de passe et sans aucun droit sur les tables. Pour faire
-- une remise, une session ayant accès au serveur s'y rattache (superutilisateur, ou `GRANT usine_remise TO <rôle>;`
-- puis `SET ROLE usine_remise;`). Si le rôle des migrations ne peut pas créer de rôle, `usine_remise` n'est pas créé
-- (avis dans le journal de PostgreSQL) : seul un superutilisateur peut alors faire la remise.
-- Limite connue : le propriétaire peut se rendre EXECUTE (GRANT) et possède les tables ; ce retrait empêche un appel
-- par le code de l'application, pas un rôle propriétaire compromis (la barrière est alors le serveur).
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION remettre_second_code(text,text,text) SET search_path = %I, pg_temp', current_schema());
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'usine_remise') THEN
    IF (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
      BEGIN
        CREATE ROLE usine_remise NOLOGIN;
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        NULL; -- créé en même temps par une autre base du même serveur
      END;
    ELSE
      RAISE NOTICE 'Rôle usine_remise non créé (droit CREATEROLE absent) : remettre_second_code réservée au superutilisateur.';
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION remettre_second_code(text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION remettre_second_code(text,text,text) FROM CURRENT_USER;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'usine_remise') THEN
    GRANT EXECUTE ON FUNCTION remettre_second_code(text,text,text) TO usine_remise;
  END IF;
END;
$$;
