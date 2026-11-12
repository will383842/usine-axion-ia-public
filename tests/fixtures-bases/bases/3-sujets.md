# Sujets (exemple fictif)

## table: famille

| code | nom | suivi | rythme_cible | public | toujours_valide_par_will | dans_les_lots | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Famille A (exemple) |  | 1 |  |  |  | valide | 1 | exemple |  |  |
| B | Actualités (exemple) |  | 1 |  |  |  | valide | 1 | exemple |  |  |

## table: sujet

| code | famille | titre | de_quoi | public | nourri_par | serie_studio | types_contenu | interdits_propres | actif | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sujet.exemple | A | Un sujet d'exemple | De quoi on parle (exemple). | public.clients |  |  |  |  | oui | valide | 1 | exemple |  |  |

## table: actualite

| code | titre | ce_qui_change_pour_un_dirigeant | source | date_source | perime_le | retenue | etat | version | origine | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| actu.exemple | Une nouveauté d'exemple | Un changement d'exemple. | https://example.com/nouveaute | 2026-01-01 |  | non | valide | 1 | exemple |  |
