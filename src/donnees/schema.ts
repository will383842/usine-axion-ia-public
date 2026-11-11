/**
 * Colonnes de chaque table, telles que la migration 001 les crée (un essai compare les deux).
 * Seules ces colonnes peuvent être lues ou écrites par les dépôts de `src/donnees/`.
 */

/** Tables des bases : colonnes exactes des « ## table: » de bases/pour-la-machine/, toutes en texte. */
export const COLONNES_BASES = {
  secteur: ["code", "nom", "etat", "version", "origine", "source", "valide_le"],
  metier: ["code", "numero", "secteur", "nature", "nom", "se_nomment", "mots", "veut_vraiment", "ne_jamais_dire", "tailles_typiques", "actif", "profondeur", "calcule", "etat", "version", "origine", "source", "valide_le"],
  public: ["code", "nom", "se_nomment", "mots", "veut_vraiment", "ne_jamais_dire", "etat", "version", "origine", "source", "valide_le"],
  douleur: ["code", "cible", "dite", "scene_avant", "cout", "services", "tailles", "type_contenu", "calcule", "etat", "version", "origine", "source", "valide_le"],
  objection: ["code", "cible", "objection", "reponse", "service", "ou_l_utiliser", "etat", "version", "origine", "source", "valide_le"],
  souci_releve: ["code", "numero", "cible", "souci", "source", "force", "lu_le", "etat", "version", "origine", "valide_le"],
  taille: ["code", "nom", "effectif", "qui_decide", "comment_parler", "ce_qui_change", "mots", "ne_jamais_dire", "offres", "reseaux_privilegies", "poids", "actif", "etat", "version", "origine", "source", "valide_le"],
  famille: ["code", "nom", "suivi", "rythme_cible", "public", "toujours_valide_par_will", "dans_les_lots", "etat", "version", "origine", "source", "valide_le"],
  sujet: ["code", "famille", "titre", "de_quoi", "public", "nourri_par", "serie_studio", "types_contenu", "interdits_propres", "actif", "etat", "version", "origine", "source", "valide_le"],
  actualite: ["code", "titre", "ce_qui_change_pour_un_dirigeant", "source", "date_source", "perime_le", "retenue", "etat", "version", "origine", "valide_le"],
  cas_usage: ["code", "numero", "cible", "service", "sorte", "titre", "probleme", "etapes", "ce_que_ca_change", "reste_humain", "douleurs", "posture", "faits", "offre", "sujet", "formats_conseilles", "phare", "accroche", "appuye_sur", "cas_origine", "calcule", "etat", "version", "origine", "source", "valide_le"],
  format_video: ["code", "code_classement", "nom", "statut", "tournage", "duree", "reseaux_conseilles", "squelette", "en_lot", "etat", "version", "origine", "source", "valide_le"],
  format_autre: ["code", "proprietaire", "squelette", "longueur_min", "longueur_max", "contient_appel", "validation", "etat_service", "etat", "version", "origine", "source", "valide_le"],
  publication: ["code", "reseau", "type", "ratio", "duree_conseillee", "duree_max", "accroche", "legende_max", "legende_visible", "mots_diese", "lien_cliquable", "premier_commentaire", "mot_permis", "rythme_max_semaine", "ecart_min_h", "publieur", "lu_le", "relire", "etat", "version", "origine", "source", "valide_le"],
  appel: ["code", "reseaux", "cible", "type_contenu", "type", "objectif", "dit", "ecran", "legende", "mot", "lien", "emplacement", "etat", "version", "origine", "source", "valide_le"],
  voix: ["code", "regle", "pourquoi", "s_applique_a", "etat", "version", "origine", "source", "valide_le"],
  interdit: ["code", "expression", "remplacement", "raison", "portee", "etat", "version", "origine", "source", "valide_le"],
  fait: ["code", "enonce", "source", "date", "portee", "perime_le", "etat", "version", "origine", "valide_le"],
  accroche: ["code", "famille", "modele", "exemple", "ne_pas_faire", "reseaux", "types_contenu", "etat", "version", "origine", "source", "valide_le"],
} as const;

export type NomTableBase = keyof typeof COLONNES_BASES;

/** Colonnes ajoutées par l'Usine à chaque table des bases. `metier.allume` : posé par Will, jamais par l'import. */
export const COLONNES_TECHNIQUES_BASES = ["importe_le", "cree_le", "modifie_le"] as const;
export const COLONNES_PROPRES_BASES: Partial<Record<NomTableBase, readonly string[]>> = { metier: ["allume"] };

/** Tables de l'Usine. */
export const COLONNES_USINE = {
  service: ["code", "nom", "serie_studio", "passage_site", "ordre", "etat", "version", "origine", "source", "valide_le", "cree_le", "modifie_le", "archive_le"],
  compte: ["code", "reseau", "identifiant", "nature", "nom", "publieur", "lien_profil", "objectif_visibilite", "actif", "etat", "version", "origine", "source", "valide_le", "cree_le", "modifie_le", "archive_le"],
  reglage: ["cle", "valeur", "cree_le", "modifie_le"],
  interrupteur: ["code", "nom", "description", "allume", "cree_le", "modifie_le", "archive_le"],
  journal: ["id", "le", "sujet", "cible", "message", "donnees"],
  refus: ["code", "nom", "ordre", "cree_le", "modifie_le", "archive_le"],
  lot: ["id", "numero", "nombre", "plafond_eur", "reglages", "etat", "commande_le", "cree_le", "modifie_le", "archive_le"],
  lot_ligne: [
    "id", "lot", "rang", "type_contenu", "format", "public", "metier", "taille", "service", "douleur", "cas_usage", "sujet", "actualite",
    "accroche", "structure", "reseaux", "fins", "repere", "cout_max_eur", "paquet", "etat", "code_version", "refus", "cree_le", "modifie_le", "archive_le",
    "signature",
  ],
  cadeau: ["code", "nom", "document", "version", "etat", "valide_le", "cree_le", "modifie_le", "archive_le"],
  mot: ["code", "mot", "cadeau", "outil", "automatisations", "ordre", "cree_le", "modifie_le", "archive_le"],
  mot_texte: ["id", "mot", "nature", "reseau", "rang", "version", "texte", "source", "etat", "valide_le", "en_service", "cree_le", "modifie_le", "archive_le"],
  mot_branche: ["id", "mot", "reseau", "compte", "etat", "le", "cree_le", "modifie_le", "archive_le"],
  opposition: ["id", "cle", "canal", "depuis", "source", "cree_le"],
  carte: ["id", "cle", "titre", "detail", "bouton", "lien", "urgence", "interrupteur", "origine", "echeance", "fait_le", "cree_le", "modifie_le", "archive_le"],
  compte_a_suivre: ["code", "reseau", "nom", "lien", "note", "propose_le", "fait_le", "cree_le", "modifie_le", "archive_le"],
  calendrier_ligne: ["id", "lot_ligne", "reseau", "compte", "type_contenu", "format", "prevue_le", "etat", "note", "cree_le", "modifie_le", "archive_le"],
  deja_fabrique: [
    "id", "type_contenu", "metier", "taille", "service", "douleur", "cas_usage", "sujet", "actualite", "format", "structure", "signature",
    "code_version", "fabrique_le", "note", "cree_le", "modifie_le", "archive_le",
  ],
  releve_mot: ["id", "semaine", "mot", "compte", "commentaires", "messages", "demandes_guide", "abonnes_gagnes", "cree_le", "modifie_le", "archive_le"],
} as const;

export type NomTableUsine = keyof typeof COLONNES_USINE;
