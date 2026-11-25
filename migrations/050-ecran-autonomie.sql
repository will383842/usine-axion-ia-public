-- T70 · L'écran du plafond devient « Ce que l'Usine dépense seule » (allumer la dépense seule et régler son plafond).
-- Additive et rejouable : ne touche que le nom et l'aide, jamais à `allume` (l'écran reste éteint tant que le fondateur ne l'allume pas).
-- Aucun interrupteur propre à la dépense seule n'est créé ici : l'état vrai vit dans le Studio.
UPDATE interrupteur
   SET nom = 'Ce que l''Usine dépense seule',
       description = 'Allumé : vous pouvez allumer ou éteindre ce que l''Usine dépense seule et régler son plafond du mois. Allumer demande deux confirmations ; éteindre est immédiat.'
 WHERE code = 'plafond.ecran';
