#!/usr/bin/env bash
# Sauvegarde nocturne de la base de l'Usine : dump, chiffrement, dépôt chez R2. Ne supprime rien (ni local, ni distant).
# En cas d'échec : un e-mail d'alerte, jamais de push. Variables lues dans le fichier d'environnement du serveur.
set -euo pipefail

DOSSIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FICHIER="${SAUVEGARDE_ENV:-/opt/usine-axion-ia/.env.sauvegarde}"
[ -f "$ENV_FICHIER" ] && . "$ENV_FICHIER"

CONTENEUR="${SAUVEGARDE_CONTENEUR:-usine-db}"
BASE="${SAUVEGARDE_BASE:-usine}"
UTILISATEUR="${SAUVEGARDE_UTILISATEUR:-postgres}"
SORTIE="${SAUVEGARDE_DOSSIER:-/var/backups/usine}"
CLE_CHIFFREMENT="${SAUVEGARDE_CLE_FICHIER:-/opt/usine-axion-ia/sauvegarde.cle}"
JOUR="$(date -u +%Y-%m-%d)"
FICHIER="$SORTIE/usine-$JOUR.sql.gz.enc"

alerter() {
  local code=$?
  local sujet="Sauvegarde de l'Usine : échec du $JOUR"
  if [ -n "${SAUVEGARDE_ALERTE_EMAIL:-}" ]; then
    printf 'La sauvegarde de nuit a échoué (code %s). Rien n a été supprimé. Voir le journal du serveur.\n' "$code" \
      | mail -s "$sujet" "$SAUVEGARDE_ALERTE_EMAIL" || true
  fi
  exit "$code"
}
trap alerter ERR

mkdir -p "$SORTIE"
[ -e "$FICHIER" ] && { echo "Sauvegarde du $JOUR déjà présente : rien à faire."; exit 0; }

# Écrit dans un fichier provisoire, renommé seulement une fois complet.
docker exec "$CONTENEUR" pg_dump -U "$UTILISATEUR" "$BASE" \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$CLE_CHIFFREMENT" > "$FICHIER.partiel"
[ -s "$FICHIER.partiel" ]
mv "$FICHIER.partiel" "$FICHIER"

# Un dépôt (PUT) signé par copier-r2.mjs, envoyé par curl ; la configuration passe par l'entrée standard.
node "$DOSSIER/copier-r2.mjs" "$FICHIER" "usine/$(basename "$FICHIER")" | curl -K -
echo "Sauvegarde du $JOUR envoyée."
