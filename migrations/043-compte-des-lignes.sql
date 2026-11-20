-- 043 · Compte des lignes du calendrier. Migration ADDITIVE et rejouable : un seul UPDATE, aucune suppression.
-- Pose le compte actif du réseau (une page ou un compte avant un profil, puis l'ordre du code) sur les lignes
-- nées sans compte. Ne touche ni une ligne archivée, ni une ligne déjà au Studio, ni une ligne qui a déjà un compte.
UPDATE calendrier_ligne c
   SET compte = a.code
  FROM (
    SELECT DISTINCT ON (reseau) reseau, code
      FROM compte
     WHERE actif AND etat <> 'retire' AND archive_le IS NULL
     ORDER BY reseau, (nature = 'profil'), code
  ) a
 WHERE c.compte IS NULL
   AND c.reseau = a.reseau
   AND c.archive_le IS NULL
   AND c.etat = 'brouillon'
   AND c.etat_studio IS NULL;
