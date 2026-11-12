# Voix et interdits (exemple fictif)

## table: voix

| code | regle | pourquoi | s_applique_a | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| voix.exemple | Vouvoyer. | Exemple. | tout | valide | 1 | exemple |  |  |

## table: interdit

| code | expression | remplacement | raison | portee | etat | version | origine | source | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| interdit.ville | « exemple ville » | Parler du métier sans lieu. | Un lieu précis réduit le public. | tout | valide | 1 | exemple |  |  |
| interdit.cpf | « exemple cpf » | Ne pas le citer. | Un financement précis n'est pas celui de tous. | tout | valide | 1 | exemple |  |  |
| interdit.gain-garanti | « exemple gain-garanti » | Dire ce qui change. | Aucune promesse de résultat. | tout | valide | 1 | exemple |  |  |
| interdit.chiffre | « exemple chiffre » | Dire ce qui change, sans chiffre. | Aucun chiffre inventé. | tout | valide | 1 | exemple |  |  |
| interdit.cas-client | « exemple cas-client » | Parler d'un cas général. | Aucun client réel n'est cité. | tout | valide | 1 | exemple |  |  |
| interdit.prix | « exemple prix » | Inviter à un échange. | Aucun prix dans un texte. | tout | valide | 1 | exemple |  |  |
| interdit.likez | « exemple likez » | Poser une question. | Aucune demande de mention. | tout | valide | 1 | exemple |  |  |
| interdit.abonnement-condition | « exemple abonnement-condition » | Écrire le mot. | L'abonnement n'est pas une condition. | tout | valide | 1 | exemple |  |  |
| interdit.mot-hors-reseau | « exemple mot-hors-reseau » | Choisir le diagnostic. | Le mot ne vaut que sur certains réseaux. | tout | valide | 1 | exemple |  |  |
| interdit.promesse-envoi | « exemple promesse-envoi » | Indiquer où le trouver. | Aucune promesse d'envoi. | tout | valide | 1 | exemple |  |  |
| interdit.apporteurs | « exemple apporteurs » | Dire « partenaire ». | Un terme réservé à un autre public. | tout | valide | 1 | exemple |  |  |
| interdit.pme-cac40 | « exemple pme-cac40 » | Parler de la taille réelle. | Une comparaison de taille trompeuse. | tout | valide | 1 | exemple |  |  |
| interdit.top | « exemple top » | Décrire sans classement. | Un classement n'est pas sourcé. | tout | valide | 1 | exemple |  |  |
| interdit.promesse-gain | « exemple promesse-gain » | Décrire ce qui change. | Aucune promesse de gain. | tout | valide | 1 | exemple |  |  |
| interdit.remplacer | « exemple remplacer » | Parler d'aide au travail. | Aucune promesse de remplacer des personnes. | tout | valide | 1 | exemple |  |  |
| interdit.recrutement-revenu | « exemple recrutement-revenu » | Parler du rôle. | Aucune promesse de revenu dans le recrutement. | recrutement | valide | 1 | exemple |  |  |
| interdit.recrutement-facile | « exemple recrutement-facile » | Parler du rôle. | Aucune promesse de facilité dans le recrutement. | recrutement | valide | 1 | exemple |  |  |
| interdit.recrutement-qualiopi | « exemple recrutement-qualiopi » | Parler de la formation. | Un label réservé à un autre public. | recrutement | valide | 1 | exemple |  |  |
| interdit.verification-apporteur | « exemple verification-apporteur » | Parler du cadre. | Une vérification qu'on ne promet pas. | recrutement | valide | 1 | exemple |  |  |
| interdit.marque-logiciel | « exemple marque-logiciel » | Dire « un tableur ». | Aucune marque de logiciel. | tout | valide | 1 | exemple |  |  |
| interdit.accroche-creuse | « exemple accroche-creuse » | Partir d'une scène. | Une accroche vide de sens. | tout | valide | 1 | exemple |  |  |

## table: fait

| code | enonce | source | date | portee | perime_le | etat | version | origine | valide_le |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fait.exemple | Un fait d'exemple. | https://example.com/fait | 2026-01-01 | tout |  | valide | 1 | exemple |  |
