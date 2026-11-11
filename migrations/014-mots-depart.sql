-- T04 · Départ du registre des mots : GUIDE, son cadeau, ses textes (mots/GUIDE.md §§ 2 à 4, 8, 12 et 13) et l'indicateur « mot branché ».
-- Données de départ seulement : rejouable sans doublon, rien n'est supprimé, aucun texte n'est en service au départ.
-- Instagram (§ 13) reste « à valider » ; Facebook (§ 12), réponses publiques, STOP et liens sont validés le 2026-10-12.

INSERT INTO interrupteur (code, nom, description, allume)
VALUES ('mots', 'Mots et cadeaux', 'Écran « Mots » : textes, identifiants d''automatisation, mot branché, cadeaux.', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO cadeau (code, nom, version, etat, valide_le)
VALUES ('guide-ia', 'Guide IA entreprise', '1', 'valide', '2026-10-12')
ON CONFLICT (code) DO NOTHING;

INSERT INTO mot (code, mot, cadeau, outil, ordre)
VALUES ('mot-guide', 'GUIDE', 'guide-ia', 'zernio', 1)
ON CONFLICT (code) DO NOTHING;

INSERT INTO mot_texte (mot, nature, reseau, rang, version, texte, source, etat, valide_le)
VALUES
  ('mot-guide','premier_message','instagram',1,1,$t$Bonjour, merci pour votre commentaire ! Le Guide IA entreprise d'Axion-IA est gratuit et réservé aux abonnés du compte. Abonnez-vous, puis touchez le bouton ci-dessous : je vous envoie le lien. (réponse automatique)$t$,'GUIDE.md § 13','propose',NULL),
  ('mot-guide','bouton','instagram',1,1,$t$Je suis abonné(e) ✅$t$,'GUIDE.md § 13','propose',NULL),
  ('mot-guide','message_non_abonne','instagram',1,1,$t$Vous ne suivez pas encore le compte. Abonnez-vous, puis touchez à nouveau le bouton : le lien part aussitôt. (réponse automatique)$t$,'GUIDE.md § 13','propose',NULL),
  ('mot-guide','message_lien','instagram',1,1,$t$Merci pour votre abonnement ! Voici le lien du Guide IA entreprise, gratuit : https://axion-ia.com/fr/guide-ia?utm_source=instagram&utm_medium=message&utm_campaign=mot-guide. Indiquez votre e-mail sur la page, il arrive dans les minutes qui suivent. Pour ne plus recevoir de message de ma part, répondez STOP. (réponse automatique)$t$,'GUIDE.md § 13','propose',NULL),
  ('mot-guide','premier_message','facebook',1,1,$t$Bonjour, merci pour votre commentaire ! Vous voulez recevoir le Guide IA entreprise d'Axion-IA ? Il est gratuit. Touchez le bouton ci-dessous et je vous envoie le lien. (réponse automatique)$t$,'GUIDE.md § 12','valide','2026-10-12'),
  ('mot-guide','bouton','facebook',1,1,$t$Recevoir le guide$t$,'GUIDE.md § 12','valide','2026-10-12'),
  ('mot-guide','message_lien','facebook',1,1,$t$Voici le lien : https://axion-ia.com/fr/guide-ia?utm_source=facebook&utm_medium=message&utm_campaign=mot-guide
Indiquez votre e-mail sur la page : le guide arrive dans votre boîte dans les minutes qui suivent (pensez à regarder les indésirables).
Si ces sujets vous intéressent, vous pouvez aussi suivre le compte. C'est une invitation, rien d'obligatoire.
Pour ne plus recevoir de message de ma part, répondez STOP. (réponse automatique)$t$,'GUIDE.md § 2 (lien du § 8)','valide','2026-10-12'),
  ('mot-guide','reponse_publique','tous',1,1,$t$C'est parti, regardez vos messages privés 📩 (réponse auto)$t$,'GUIDE.md § 4','valide','2026-10-12'),
  ('mot-guide','reponse_publique','tous',2,1,$t$Merci ! Je vous ai écrit en message privé (réponse auto)$t$,'GUIDE.md § 4','valide','2026-10-12'),
  ('mot-guide','reponse_publique','tous',3,1,$t$Envoyé en privé : touchez le bouton pour recevoir le lien (réponse auto)$t$,'GUIDE.md § 12','valide','2026-10-12'),
  ('mot-guide','reponse_publique','tous',4,1,$t$Bien reçu, regardez aussi vos demandes de messages (réponse auto)$t$,'GUIDE.md § 4','valide','2026-10-12'),
  ('mot-guide','reponse_publique','tous',5,1,$t$Merci pour votre commentaire, la suite est dans vos messages (réponse auto)$t$,'GUIDE.md § 4','valide','2026-10-12'),
  ('mot-guide','stop','tous',1,1,$t$C'est noté, vous ne recevrez plus de message de ma part. (réponse automatique)$t$,'GUIDE.md § 3','valide','2026-10-12'),
  ('mot-guide','lien_message','instagram',1,1,$t$https://axion-ia.com/fr/guide-ia?utm_source=instagram&utm_medium=message&utm_campaign=mot-guide$t$,'GUIDE.md § 8 · message privé Instagram','valide','2026-10-12'),
  ('mot-guide','lien_profil','instagram',1,1,$t$https://axion-ia.com/fr/guide-ia?utm_source=instagram&utm_medium=profil&utm_campaign=mot-guide$t$,'GUIDE.md § 8 · profil Instagram','valide','2026-10-12'),
  ('mot-guide','lien_message','facebook',1,1,$t$https://axion-ia.com/fr/guide-ia?utm_source=facebook&utm_medium=message&utm_campaign=mot-guide$t$,'GUIDE.md § 8 · message privé Facebook','valide','2026-10-12'),
  ('mot-guide','lien_commentaire','facebook',1,1,$t$https://axion-ia.com/fr/guide-ia?utm_source=facebook&utm_medium=commentaire&utm_campaign=mot-guide$t$,'GUIDE.md § 8 · premier commentaire Facebook','valide','2026-10-12'),
  ('mot-guide','lien_commentaire','linkedin',1,1,$t$https://axion-ia.com/fr/guide-ia?utm_source=linkedin&utm_medium=commentaire&utm_campaign=mot-guide$t$,'GUIDE.md § 8 · premier commentaire et réponses LinkedIn','valide','2026-10-12'),
  ('mot-guide','lien_profil','tiktok',1,1,$t$https://axion-ia.com/fr/guide-ia?utm_source=tiktok&utm_medium=profil&utm_campaign=mot-guide$t$,'GUIDE.md § 8 · profil TikTok','valide','2026-10-12'),
  ('mot-guide','lien_profil','youtube',1,1,$t$https://axion-ia.com/fr/guide-ia?utm_source=youtube&utm_medium=profil&utm_campaign=mot-guide$t$,'GUIDE.md § 8 · profil de la chaîne YouTube','valide','2026-10-12')
ON CONFLICT (mot, nature, reseau, rang, version) DO NOTHING;

INSERT INTO mot_branche (mot, reseau, compte, etat)
VALUES ('GUIDE', 'instagram', 'williamsjullin', 'non_branche')
ON CONFLICT (mot, reseau, compte) DO NOTHING;
