#!/usr/bin/env bash
# Restaure une sauvegarde de l'Usine dans une base NEUVE (jamais par-dessus une base existante).
# Usage : restaurer-base.sh <fichier .sql.gz.enc> <nom-de-la-base-neuve>
set -euo pipefail

FICHIER="${1:?fichier de sauvegarde manquant}"
NEUVE="${2:?nom de la base neuve manquant}"
CONTENEUR="${SAUVEGARDE_CONTENEUR:-usine-db}"
UTILISATEUR="${SAUVEGARDE_UTILISATEUR:-postgres}"
CLE_CHIFFREMENT="${SAUVEGARDE_CLE_FICHIER:-/opt/usine-axion-ia/sauvegarde.cle}"

[[ "$NEUVE" =~ ^[a-z][a-z0-9_]*$ ]] || { echo "Nom de base invalide." >&2; exit 1; }
[ -f "$FICHIER" ] || { echo "Fichier introuvable : $FICHIER" >&2; exit 1; }

if docker exec "$CONTENEUR" psql -U "$UTILISATEUR" -tAc "SELECT 1 FROM pg_database WHERE datname = '$NEUVE'" | grep -q 1; then
  echo "La base $NEUVE existe déjà : choisissez un autre nom, rien n'a été touché." >&2
  exit 1
fi

docker exec "$CONTENEUR" createdb -U "$UTILISATEUR" "$NEUVE"
openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$CLE_CHIFFREMENT" < "$FICHIER" \
  | gunzip \
  | docker exec -i "$CONTENEUR" psql -U "$UTILISATEUR" -v ON_ERROR_STOP=1 -q "$NEUVE"
echo "Restauration faite dans la base $NEUVE. Vérifiez-la, puis pointez DATABASE_URL vers elle."
