# Cibles (exemple fictif)

Fichier de test : aucune donnée réelle.

## table: secteur

| code | nom | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- |
| compta | Comptabilité (exemple) | valide | 1 | exemple |  |  |

## table: metier

| code | numero | secteur | nature | nom | se_nomment | mots | veut_vraiment | ne_jamais_dire | tailles_typiques | actif | profondeur | calcule | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| compta.expert-comptable | 1 | compta | metier | Expert-comptable |  |  |  |  | TPE ; PME | oui | complet |  | valide | 1 | exemple |  |  |

## table: public

| code | nom | se_nomment | mots | veut_vraiment | ne_jamais_dire | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| public.clients | Clients |  |  |  |  | valide | 1 | exemple |  |  |
| public.apporteurs | Apporteurs |  |  |  |  | valide | 1 | exemple |  |  |
| public.formateurs | Formateurs |  |  |  |  | valide | 1 | exemple |  |  |

## table: douleur

| code | cible | dite | scene_avant | cout | services | tailles | type_contenu | calcule | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| compta.expert-comptable.d01 | compta.expert-comptable | Une phrase d'exemple formation 1. | Une scène d'exemple. | Un coût d'exemple. | formation |  |  |  | valide | 1 | exemple |  |  |
| compta.expert-comptable.d02 | compta.expert-comptable | Une phrase d'exemple formation 2. | Une scène d'exemple. | Un coût d'exemple. | formation |  |  |  | valide | 1 | exemple |  |  |
| compta.expert-comptable.d03 | compta.expert-comptable | Une phrase d'exemple audit 1. | Une scène d'exemple. | Un coût d'exemple. | audit |  |  |  | valide | 1 | exemple |  |  |
| compta.expert-comptable.d04 | compta.expert-comptable | Une phrase d'exemple audit 2. | Une scène d'exemple. | Un coût d'exemple. | audit |  |  |  | valide | 1 | exemple |  |  |
| compta.expert-comptable.d05 | compta.expert-comptable | Une phrase d'exemple coaching 1. | Une scène d'exemple. | Un coût d'exemple. | coaching |  |  |  | valide | 1 | exemple |  |  |
| compta.expert-comptable.d06 | compta.expert-comptable | Une phrase d'exemple coaching 2. | Une scène d'exemple. | Un coût d'exemple. | coaching |  |  |  | valide | 1 | exemple |  |  |
| compta.expert-comptable.d07 | compta.expert-comptable | Une phrase d'exemple integration 1. | Une scène d'exemple. | Un coût d'exemple. | integration |  |  |  | valide | 1 | exemple |  |  |
| compta.expert-comptable.d08 | compta.expert-comptable | Une phrase d'exemple integration 2. | Une scène d'exemple. | Un coût d'exemple. | integration |  |  |  | valide | 1 | exemple |  |  |

## table: objection

| code | cible | objection | reponse | service | ou_l_utiliser | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| compta.expert-comptable.o01 | compta.expert-comptable | Une objection d'exemple. | Une réponse d'exemple. | audit |  | valide | 1 | exemple |  |  |

## table: souci_releve

| code | numero | cible | souci | source | force | lu_le | etat | version | origine | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| compta.expert-comptable.s01 | 1 | compta.expert-comptable | Un souci d'exemple. | https://example.com/souci | moyenne |  | valide | 1 | exemple |  |
