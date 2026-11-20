# Porte du studio · l'Usine propose des sujets

Échange entre le studio et l'Usine (CONTRATS-ECHANGE.md § 3, « porte du studio, demande D9 »). Types : `src/contrats/porte.ts`.

## Allumer, éteindre

- Variable du serveur de l'Usine : `USINE_PORTE_SECRET` (32 caractères au moins), la même dans le studio.
- Absente, vide ou trop courte : la porte est **éteinte**, toutes ses routes rendent `404`.
- Chaque appel porte `Authorization: Bearer <USINE_PORTE_SECRET>` (comparé en temps constant). Absent ou faux : `401`, sans détail.
- La porte ne dépend ni de la session de Will ni des interrupteurs `tirage` et `lots` : son interrupteur est le secret.
- Corps en `application/json` (sinon `415`), 16 Ko au plus (`413`, refusé dès que `content-length` l'annonce, sinon dès que la lecture par morceaux dépasse 16 Ko : le reste n'est pas lu), champs stricts : un champ inconnu = `400`.
- Erreur : `{ "erreur": "<phrase>", "code": "<code>" }`. Aucune donnée de personne n'est rendue.

## `GET /api/porte/metiers`

Pour le filtre du studio.

```json
{ "metiers": [ { "code": "compta.expert-comptable", "libelle": "Expert-comptable",
  "secteur": { "code": "finance", "libelle": "Finance" }, "allume": false, "cas_sources": 12 } ] }
```

`cas_sources` : cas d'usage non retirés qui citent une source.

## `POST /api/porte/sujets`

```json
{ "n": 5, "type_contenu": "video", "reseaux": ["instagram", "facebook"],
  "metiers": ["compta.expert-comptable"], "tailles": ["TPE", "PME"], "services": ["audit"], "graine": 42 }
```

- `n` : 1 à 20. `type_contenu` : `video` · `carrousel` · `image` · `texte` · `story`. `reseaux` : au moins un (`RESEAUX` du contrat).
- `metiers` (facultatif) : le tirage se restreint à ces métiers, **même non allumés**. Absent : les métiers allumés ;
  aucun allumé : `409` `{ "code": "aucun_metier_allume", "erreur": "Aucun métier allumé : choisissez un métier." }`.
  Un métier inconnu ou retiré : `400` `metier_inconnu`.
- `tailles`, `services` (facultatifs) : seulement ces valeurs. `graine` : même graine, mêmes bases, même historique = même réponse.
- Même tirage qu'un lot : signature anti-doublon (déjà commandé, déjà fabriqué, déjà retenu au studio), délai d'un cas,
  refus de Will, variété, rythme des nouveautés, fin choisie par réseau. Formats en service du type demandé, à parts égales.
- **N'écrit rien** : proposer deux fois n'empêche rien ; seul `retenir` retire un sujet des propositions.

Réponse :

```json
{ "demandees": 5, "pourquoi": [],
  "lignes": [ {
    "rang": 1,
    "signature": "compta.expert-comptable|pme|audit|compta.expert-comptable.d2|compta.expert-comptable.audit.c01|tableau-anime|scène vécue",
    "parts": { "metier": "compta.expert-comptable", "taille": "PME", "service": "audit", "douleur": "compta.expert-comptable.d2",
               "cas_usage": "compta.expert-comptable.audit.c01", "actualite": null, "format": "tableau-anime", "structure": "scène vécue" },
    "type_contenu": "video", "reseaux": ["instagram", "facebook"],
    "metier": { "code": "…", "libelle": "…", "secteur": "…" },
    "taille": { "code": "PME", "libelle": "…" }, "service": { "code": "audit", "libelle": "…" },
    "douleur": { "code": "…", "dite": "…", "scene_avant": "…" },
    "cas_usage": { "code": "…", "titre": "…", "probleme": "…", "ce_que_ca_change": "…" },
    "sujet": { "code": "a.audit", "titre": "…" },
    "actualite": null,
    "format": { "code": "tableau-anime", "libelle": "Tableau animé" },
    "accroche": { "code": "accroche.…", "famille": "scène vécue", "modele": "…", "exemple": "…" },
    "fins": { "instagram": { "appel": "fin-if-question", "type": "question", "objectif": "QUESTION", "dit": "…", "ecran": "…", "mot": null } }
  } ] }
```

Une nouveauté (famille « Actualités ») a `metier`, `taille`, `service`, `douleur`, `cas_usage` à `null` et `actualite` rempli.
Moins de lignes que demandé : `pourquoi` dit pourquoi, par métier (`metier: null` = pour toute la demande).

## `POST /api/porte/sujets/retenir`

Le studio a retenu un sujet : l'Usine le note « déjà fabriqué » (table `deja_fabrique`) et ne le propose plus jamais.

```json
{ "signature": "<signature rendue>", "parts": { "…": "les parts rendues, telles quelles" },
  "type_contenu": "video", "reference_studio": "0042-AV-TT" }
```

- `signature` doit être celle des `parts` (sinon `400` `signature_incoherente`) ; il faut un `format` et un cas ou une nouveauté. Parts exigées (sinon `400` `parts_absentes`) : pour un cas d'usage, `metier` et `structure` ; pour une nouveauté, `structure`. `douleur` (cas sans douleur reliée), `taille`, `service` peuvent être `null`, comme `metier`, `douleur` et `cas_usage` pour une nouveauté : les `parts` rendues par `/sujets` sont toujours acceptées telles quelles.
- `jour` (« AAAA-MM-JJ », vraie date) et `reseau` : **facultatifs**, le jour et le réseau visés au calendrier du studio (sinon `400` `demande_invalide`). Rangés avec le sujet (`vise_le`, `vise_reseau`) : la semaine proposée les compte comme un créneau pris. Sans eux, rien ne change. Un sujet déjà noté (`deja: true`) n'est pas réécrit : ses `jour` et `reseau` non plus.
- `reference_studio` : code de version (`0042-AV-TT`, gardé dans `code_version`) ou tout repère du studio (gardé dans la note).
- Idempotent : rejouer l'appel rend `{ "signature": "…", "deja": true }` sans rien réécrire ; la première fois, `"deja": false`.

## `POST /api/porte/sujets/retenir-lot` (v1.1)

Retenir plusieurs sujets d'un coup. Rétrocompatible : `retenir` et `sujets` ne changent pas, aucun code d'erreur nouveau.

```json
{ "sujets": [ { "signature": "…", "parts": { "…": "…" }, "type_contenu": "video", "reference_studio": "0042-AV-TT" } ] }
```

- `sujets` : 1 à 20 éléments (`LOT_MAX_RETENIR`), chacun au format du corps de `retenir`. Le plafond de 16 Ko de la porte s'applique au corps entier ; pour 61 sujets, faire 4 appels (20, 20, 20, 1).
- Tous les sujets sont contrôlés avant la première écriture (mêmes règles et mêmes codes que `retenir`) : un seul mauvais sujet et rien n'est noté. Un code des parts inconnu des bases (`400` `code_inconnu`) se découvre à l'écriture : les sujets déjà écrits restent notés, rejouer le lot corrigé est sans danger.
- Réponse : `{ "retenus": 2, "deja": 1, "lignes": [ { "signature": "…", "deja": false } ] }`, une ligne par sujet dans l'ordre reçu. `retenus` : notés à cet appel ; `deja` : déjà notés (rejeu, ou même signature deux fois dans le lot).
- Idempotent : rejouer un lot rend `retenus: 0` et `deja: n`, sans rien réécrire. Même garde, même secret que les autres routes.

## `POST /api/porte/planification/semaine` (tirage à la demande, rien n'est écrit)

Le studio demande à l'Usine de **proposer** une semaine de sujets ; l'Usine la tire elle-même, sans IA, et la rend. Le studio affiche, puis retient ce qui convient par `retenir`.

```json
{ "debut": "2026-11-23", "reseaux": ["instagram", "tiktok"] }
```

- `debut` : un lundi, « AAAA-MM-JJ » (sinon `400` `demande_invalide`, phrase en français). `reseaux` (facultatif) : 1 à 6 réseaux connus, sans doublon (sinon `400`) ; absent : Instagram et Facebook, les réseaux cochés d'office (YouTube n'est jamais proposé). Sans `reseaux`, les lignes déjà au calendrier des autres réseaux ne sont pas proposées non plus.
- Même moteur que `POST /api/porte/sujets` et que les lots. Des créneaux libres sont fabriqués en mémoire (autant que le rythme du réseau, type `video`, sur le compte actif du réseau) et passent par les mêmes règles que « Ma semaine » : rythmes, quotas, anti-répétition, écart de 90 minutes ; mais les publications d'un même réseau sont **réparties sur les jours** (un jour de plus avant d'en empiler deux le même jour). Les lignes déjà au calendrier de l'Usine (jour fixé, déjà au studio) occupent leur place et consomment le rythme ; les sujets retenus avec `jour` et `reseau` pour cette semaine comptent comme des créneaux pris. Une semaine vide est tirée en entier, une semaine en partie posée est complétée.
- Un seul tirage pour toute la semaine (`SEMAINE_SUJETS_MAX` = 20 sujets au plus), Seulement `video` en V1. L'Usine tire jusqu'à trois fois plus de sujets que de créneaux, puis les affecte dans l'ordre des créneaux : **un même cas d'usage (même titre) ne revient qu'une fois dans la semaine**, tous réseaux confondus, et **un créneau ne porte qu'un sujet qui a une fin pour son réseau** (un créneau sans sujet possible n'est pas proposé). Quand il n'y a pas assez de cas différents, un cas revient et son `pourquoi` ajoute « Ce cas d'usage revient déjà dans la semaine : il n'y en avait pas assez de différents. ». Le tirage des lots et `POST /api/porte/sujets` ne changent pas.
- **Lecture seule** : ni `calendrier_ligne`, ni lot, ni `deja_fabrique`, ni journal, ni appel sortant. Le compte n'est jamais rendu.
- **Interrupteurs** : la route ne dépend d'aucun (ni `tirage`, `lots`, `calendrier`, `planification`, `metiers`, ni les envois) ; son interrupteur est le secret de la porte, comme `/sujets`. « Tout arrêter » est respecté, vérifié en premier, avant toute lecture : `409` code `arrete` (**changement de contrat** : ce n'est plus un `200` avec `arrete: true`, que le studio ignore).

```json
{ "propositions": [ {
  "cle": "<sha256 hex, 64>", "jour": "2026-11-24", "reseau": "instagram", "type": "video", "heure": "12:30",
  "titre": "…", "pourquoi": "<libellé du métier> · Un créneau libre qui respecte votre rythme (6 par semaine).",
  "ressemble_a": "« … », fabriqué le 12/11",
  "sujet": { "…": "même forme exacte qu'une ligne de POST /api/porte/sujets (SujetPropose)" } } ],
  "message": "TikTok n'est pas proposé : aucun compte actif." }
```

- `cle` : `sha256("tirage | <lundi> | <réseau> | <signature>")` pour un créneau tiré ; la même semaine, le même réseau et le même sujet donnent la même clé. Une ligne déjà au calendrier garde sa clé (`cleSemaine(lundi, id)`) et n'a pas de `sujet`.
- `sujet` : de quoi retenir ensuite par `POST /api/porte/sujets/retenir` (`signature`, `parts`, `type_contenu`, avec `jour` et `reseau`). Même forme que `/sujets` : les vieux studios l'ignorent sans risque.
- `titre` : titre du cas d'usage, sinon de la nouveauté, sinon du sujet. `ressemble_a` (facultatif) : le dernier contenu déjà fabriqué de la même famille de sujet, avec sa date (« fabriqué le 12/11 », ou « retenu le 12/11 » s'il a seulement été retenu au studio) ; absent si rien ne ressemble.
- `message` (facultatif) : réponse partielle, par exemple un réseau sans compte actif. `200` avec ce qui a pu être tiré.
- **Stabilité** : deux appels le même jour, sans rien de changé, rendent la même réponse. La graine vient du lundi, l'instant du tirage est minuit (heure de Paris) du jour, et la grille est calculée pour toute la semaine : un créneau d'aujourd'hui déjà passé est reporté à une heure libre d'aujourd'hui (09:00, 12:30 ou 18:00, écart de 90 minutes), sinon il n'est pas proposé ; un créneau passé n'est jamais rendu. Le lendemain la réponse peut changer (la fenêtre d'anti-répétition avance, de nouvelles bases ou de nouveaux lots ont pu arriver) : c'est voulu. Un sujet déjà fabriqué ou déjà retenu n'est jamais reproposé ; un sujet retenu pour cette semaine retire sa place (même jour et réseau, sinon la dernière du réseau) et son cas d'usage, sans retirer d'autre proposition.
- Aucune donnée de personne ni compte ; les textes viennent des bases, comme pour `/sujets`.
- `type` : `video` en V1.

Erreurs (`409`, la phrase est affichée telle quelle par le studio) :

| code | phrase |
|---|---|
| `arrete` | Tout est arrêté dans l'Usine : aucune semaine n'est proposée. Rallumez depuis « Tout arrêter » dans l'Usine. |
| `aucun_metier_allume` | Aucun métier n'est allumé dans l'Usine : allumez au moins un métier dans « Mes métiers » (si l'écran est éteint : Réglages › Interrupteurs › Écran « Métiers »), puis redemandez la semaine. |
| `aucun_metier_allume` (allumé, non validé) | Un métier est allumé, mais aucun n'est validé : ouvrez sa fiche dans « Mes métiers », lisez-la, touchez « Valider ce métier », puis redemandez la semaine. |
| `aucun_compte` | Aucun compte n'est actif pour ces réseaux. Réglages › Mes comptes : rendez actif un compte Instagram ou Facebook, puis redemandez la semaine. |
| `aucun_sujet` | L'Usine n'a trouvé aucun sujet neuf pour cette semaine : ceux des métiers allumés sont déjà fabriqués ou retenus, ou il manque des cas d'usage dans les bases. Allumez un autre métier dans « Mes métiers », puis redemandez la semaine. |
| `aucun_sujet` (fin manquante) | L'Usine n'a trouvé aucun sujet neuf pour cette semaine : il manque, dans les bases, une phrase de fin pour <réseaux>. Ajoutez-en une aux bases, puis redemandez la semaine. |
| `aucun_format` | Aucun format vidéo n'est en service dans les bases. |
| `rythme_zero` | Tous vos réseaux sont au repos (rythme à zéro) : réglez un rythme dans Réglages. |
| `rythme_zero` (YouTube seul demandé) | YouTube n'est pas proposé pour l'instant : choisissez Instagram, Facebook, TikTok ou LinkedIn. |
| `semaine_pleine` | La semaine est déjà pleine selon vos rythmes : rien de plus à proposer. |
| `semaine_passee` | Cette semaine est passée : choisissez une semaine à venir. |

Cette section est en vigueur : la route rend cette forme.

## Fixtures du contrat (v1)

- Jeu figé de JSON fictifs : `tests/contrat/fixtures/` (demande valide et invalide, sujet à retenir, rejeu de `retenir`, secrets courant · périmé · trop court, codes d'erreur, dont les sept de la semaine). Schémas : `src/contrats/porte.ts`.
- Empreinte sha256 du jeu : `f2eb03e9f281978bc1c69ef53b06fe90179db2e544aff7c87b6eea351a2cc926` (fichiers `.json` triés par nom ; pour chacun : nom, saut de ligne, contenu, saut de ligne). Le Studio recopie le jeu et la même empreinte ; si l'une change, l'autre suit.
- Secret périmé (ancien secret après rotation) : `401`, sans détail. Secret du serveur absent ou de moins de 32 caractères : `404` (porte éteinte).
- Rejeu de `retenir` : première réponse `deja: false`, rejeu `deja: true`, même signature.
- Codes d'erreur rendus dans `code` : `CODES_ERREUR_PORTE` (`src/contrats/porte.ts`). Les `401` et `404` n'en portent pas.
