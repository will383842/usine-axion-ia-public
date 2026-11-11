-- 019 · Commander un lot (tâche T09).
-- 1. Interrupteur de l'écran « Lots » : éteint (Will l'allume dans Réglages › Interrupteurs).
-- 2. Garde du plafond en base : le cumul des coûts maximum des lignes d'un lot ne dépasse jamais son plafond
--    (le plafond saisi vaut accord de dépense du lot, PLAN-MAITRE C2). Vérifié à chaque écriture d'une ligne
--    et à chaque changement du plafond, la ligne du lot verrouillée pour que deux écritures ne se croisent pas.
-- Rejouable : INSERT ... ON CONFLICT DO NOTHING, CREATE OR REPLACE.

INSERT INTO interrupteur (code, nom, description, allume) VALUES
  ('lots', 'Écran « Lots »', 'Commander un lot de contenus, suivre chaque ligne (à coller, collée, fabriquée, publiée, refusée) et noter ce qui a été fabriqué avant l''Usine.', false)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION lot_plafond_respecte() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  le_lot text;
  plafond numeric;
  cumul numeric;
BEGIN
  IF TG_TABLE_NAME = 'lot' THEN
    le_lot := NEW.id;
  ELSE
    le_lot := NEW.lot;
  END IF;
  SELECT plafond_eur INTO plafond FROM lot WHERE id = le_lot FOR UPDATE;
  SELECT coalesce(sum(cout_max_eur), 0) INTO cumul FROM lot_ligne WHERE lot = le_lot;
  IF plafond IS NULL OR cumul > plafond THEN
    RAISE EXCEPTION 'plafond_depasse: le cumul des coûts maximum (% €) dépasse le plafond du lot % (% €)', cumul, le_lot, plafond
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER lot_ligne_plafond
  AFTER INSERT OR UPDATE OF cout_max_eur, lot ON lot_ligne
  FOR EACH ROW EXECUTE FUNCTION lot_plafond_respecte();

CREATE OR REPLACE TRIGGER lot_plafond
  AFTER UPDATE OF plafond_eur ON lot
  FOR EACH ROW EXECUTE FUNCTION lot_plafond_respecte();
