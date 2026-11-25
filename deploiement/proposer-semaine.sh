#!/usr/bin/env bash
# Horloge hebdomadaire de l'Usine : demande à l'application de proposer la semaine (sans IA). Ne publie rien, ne dépense rien, ne supprime rien.
# Livré éteint : rien ne part tant que HORLOGE_ACTIVE=1 n'est pas réglée (fichier d'environnement du serveur, par le fondateur).
# L'application refuse en plus si l'interrupteur « horloge.semaine » est éteint ou si « Tout arrêter » est actif.
set -euo pipefail

ENV_FICHIER="${HORLOGE_ENV:-/opt/usine-axion-ia/.env.horloge}"
# URL imposée par la ligne cron des tutoriels : lue AVANT le fichier d'environnement, elle l'emporte toujours sur HORLOGE_URL.
URL_FORCEE="${HORLOGE_URL_FORCEE:-}"
[ -f "$ENV_FICHIER" ] && . "$ENV_FICHIER"

if [ "${HORLOGE_ACTIVE:-0}" != "1" ]; then
  echo "Horloge éteinte (HORLOGE_ACTIVE n'est pas à 1) : rien à faire."
  exit 0
fi

URL="${URL_FORCEE:-${HORLOGE_URL:-http://127.0.0.1:3000/api/horloge/semaine}}"
: "${USINE_HORLOGE_SECRET:?USINE_HORLOGE_SECRET manquant}"

# Le secret passe par un descripteur anonyme (<(...)) : jamais dans la liste des processus.
curl --silent --show-error --fail --max-time 120 --request POST \
  --header @<(printf 'Authorization: Bearer %s\n' "$USINE_HORLOGE_SECRET") \
  "$URL"
echo
