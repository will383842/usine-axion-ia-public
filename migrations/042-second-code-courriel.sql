-- SCC-2 · Second code par courriel : fondation, TOUT ÉTEINT. Migration ADDITIVE et rejouable (rien n'est jamais retiré).
-- Rien ne change à la connexion tant que l'interrupteur est éteint ; il ne s'allume que par l'essai réussi de l'écran
-- « Second code » (PR suivante), jamais par le bouton des interrupteurs.

-- Interrupteur : éteint, et l'état posé ensuite par le fondateur n'est jamais réécrit.
INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('connexion.second-code-courriel', 'Second code par courriel', 'Allumé : après le mot de passe, un code à 8 chiffres est envoyé à votre adresse habituelle. Il ne s''allume que par un essai réussi, depuis « Second code ». Éteint : le mot de passe seul suffit.', false)
ON CONFLICT (code) DO NOTHING;

-- La description de l'interrupteur de l'application ne promet plus rien (la 041 reste intacte).
UPDATE interrupteur
   SET description = 'Allumé : après le mot de passe, l''Usine demande un second code, par une application d''authentification sur votre téléphone enregistré. Éteint : le mot de passe seul suffit.'
 WHERE code = 'connexion.second-code' AND description LIKE '%la version par courriel viendra%';

-- second_code_courriel : les codes émis. Jamais le code en clair ni le texte du message : seulement son empreinte
-- (HMAC-SHA-256, clé dérivée de SESSION_SECRET). `session` : empreinte du jti de la session partielle qui l'a demandé.
-- Un seul code actif à la fois (en émettre un nouveau archive le précédent).
CREATE TABLE IF NOT EXISTS second_code_courriel (
  id bigserial PRIMARY KEY,
  but text NOT NULL CHECK (but IN ('connexion', 'mise_en_service')),
  session text NOT NULL,
  empreinte_code text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL,
  essais integer NOT NULL DEFAULT 0,
  utilise_le timestamptz,
  archive_le timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS second_code_courriel_un_seul_actif ON second_code_courriel ((true)) WHERE utilise_le IS NULL AND archive_le IS NULL;
CREATE INDEX IF NOT EXISTS second_code_courriel_cree ON second_code_courriel (cree_le);

-- second_code_courriel_service : les mises en service (essai réussi). Une seule ligne active (non archivée).
CREATE TABLE IF NOT EXISTS second_code_courriel_service (
  id bigserial PRIMARY KEY,
  cree_le timestamptz NOT NULL DEFAULT now(),
  confirme_le timestamptz,
  archive_le timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS second_code_courriel_service_un_seul_actif ON second_code_courriel_service ((true)) WHERE archive_le IS NULL;

-- second_code_courriel_suspension : chaque suspension par le serveur, notée (qui, quand, par quelle session).
CREATE TABLE IF NOT EXISTS second_code_courriel_suspension (
  id bigserial PRIMARY KEY,
  faite_le timestamptz NOT NULL DEFAULT now(),
  demandee_par text NOT NULL CHECK (length(btrim(demandee_par)) > 0),
  demande_faite text NOT NULL CHECK (demande_faite IN ('session du PC', 'de vive voix')),
  session text NOT NULL CHECK (length(btrim(session)) > 0),
  service_id bigint REFERENCES second_code_courriel_service (id)
);

-- Suspension par le serveur, seulement à la demande de Will (session du PC ou de vive voix), jamais à cause d'un
-- message reçu. Modèle de remettre_second_code (027). PROCÉDURE : docs/SECOURS-SECOND-CODE.md, dans cet ordre :
--   1) au moindre doute, CHANGER LE MOT DE PASSE (toutes les sessions tombent) ;
--   2) SELECT suspendre_code_courriel('Will', 'session du PC', '<nom de la session qui la fait>');
--   3) se connecter avec le mot de passe seul ; 4) corriger la configuration du courriel ; 5) refaire l'essai de mise en service.
-- Archive la mise en service en cours (les sessions qui portent son identifiant tombent), éteint
-- `connexion.second-code-courriel`, archive les codes non utilisés, remet à zéro les essais du compte, note la suspension.
CREATE OR REPLACE FUNCTION suspendre_code_courriel(p_demandee_par text, p_demande_faite text, p_session text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_service bigint;
  v_id bigint;
BEGIN
  IF p_demande_faite IS NULL OR p_demande_faite NOT IN ('session du PC', 'de vive voix') THEN
    RAISE EXCEPTION 'Suspension refusée : seulement à la demande de Will, dans une session du PC ou de vive voix.';
  END IF;
  IF p_demandee_par IS NULL OR length(btrim(p_demandee_par)) = 0 OR p_session IS NULL OR length(btrim(p_session)) = 0 THEN
    RAISE EXCEPTION 'Suspension refusée : qui la demande et quelle session la fait doivent être notés.';
  END IF;
  PERFORM 1 FROM second_code_essais WHERE id = 1 FOR UPDATE;
  SELECT id INTO v_service FROM second_code_courriel_service WHERE archive_le IS NULL;
  UPDATE second_code_courriel_service SET archive_le = now() WHERE archive_le IS NULL;
  UPDATE interrupteur SET allume = false WHERE code = 'connexion.second-code-courriel';
  UPDATE second_code_courriel SET archive_le = now() WHERE utilise_le IS NULL AND archive_le IS NULL;
  UPDATE second_code_essais SET echecs = 0, attente_jusqu_a = NULL, attentes_de_suite = 0 WHERE id = 1;
  INSERT INTO second_code_courriel_suspension (demandee_par, demande_faite, session, service_id)
    VALUES (p_demandee_par, p_demande_faite, p_session, v_service)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Droits, comme la 027 : chemin de recherche figé ; EXECUTE retiré à PUBLIC ET au rôle de l'application ; seul `usine_remise` l'a.
-- Si ce rôle n'existe pas (créé par la 027 quand le rôle des migrations le peut), seul un superutilisateur peut suspendre.
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION suspendre_code_courriel(text,text,text) SET search_path = %I, pg_temp', current_schema());
END;
$$;
REVOKE EXECUTE ON FUNCTION suspendre_code_courriel(text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION suspendre_code_courriel(text,text,text) FROM CURRENT_USER;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'usine_remise') THEN
    GRANT EXECUTE ON FUNCTION suspendre_code_courriel(text,text,text) TO usine_remise;
  END IF;
END;
$$;
