# Porte du studio · l'Usine propose des sujets

Échange entre le studio et l'Usine (CONTRATS-ECHANGE.md § 3, « porte du studio, demande D9 »). Types : `src/contrats/porte.ts`.

## Allumer, éteindre

- Variable du serveur de l'Usine : `USINE_PORTE_SECRET` (32 caractères au moins), la même dans le studio.
- Absente, vide ou trop courte : la porte est **éteinte**, ses trois routes rendent `404`.
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
- `reference_studio` : code de version (`0042-AV-TT`, gardé dans `code_version`) ou tout repère du studio (gardé dans la note).
- Idempotent : rejouer l'appel rend `{ "signature": "…", "deja": true }` sans rien réécrire ; la première fois, `"deja": false`.
