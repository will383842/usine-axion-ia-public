#!/usr/bin/env bash
# Commande forcée côté serveur : reçoit sur l'entrée standard une image Docker compressée (docker save | gzip),
# la charge, vérifie son étiquette, la marque « courante » puis relance l'Usine.
# La commande envoyée par le client est IGNORÉE : la clé n'a droit qu'à ce script (voir authorized_keys.exemple).
# Aucun secret ici. Rien n'est supprimé : les anciennes images restent en place.
set -euo pipefail
umask 077

# Réglages posés sur le serveur (jamais par le client). Valeurs par défaut sûres.
TAILLE_MAX_OCTETS="${USINE_TAILLE_MAX_OCTETS:-2147483648}"   # 2 Gio compressés au plus
RELANCER="${USINE_RELANCER:-/opt/usine/relancer.sh}"          # script de relance posé par le fondateur sur le serveur

echec() { echo "recevoir-image : $1" >&2; exit 1; }

[ -t 0 ] && echec "entrée standard attendue (image compressée)"

dossier="$(mktemp -d)"
trap 'rm -rf "$dossier"' EXIT
archive="$dossier/image.tar.gz"

# 1. Réception bornée : au plus TAILLE_MAX_OCTETS + 1 octet lus, au-delà on refuse.
head -c "$((TAILLE_MAX_OCTETS + 1))" > "$archive"
taille="$(wc -c < "$archive")"
[ "$taille" -gt 0 ] || echec "rien reçu"
[ "$taille" -le "$TAILLE_MAX_OCTETS" ] || echec "image trop grosse"

# 2. Archive bien formée avant tout chargement.
gzip -t "$archive" || echec "archive compressée illisible"

# 3. Chargement, puis contrôle de l'étiquette annoncée : seule usine-axion-ia:ci-<sha complet> est acceptée.
sortie="$(gunzip -c "$archive" | docker load)"
etiquette="$(printf '%s\n' "$sortie" | sed -n 's/^Loaded image: //p')"
[ "$(printf '%s\n' "$etiquette" | grep -c .)" -eq 1 ] || echec "une seule image attendue"
printf '%s\n' "$etiquette" | grep -Eq '^usine-axion-ia:ci-[0-9a-f]{40}$' || echec "étiquette refusée"

# 4. Étiquette courante, puis relance (si le script de relance existe).
docker tag "$etiquette" "usine-axion-ia:courant"
if [ -x "$RELANCER" ]; then
  "$RELANCER" "$etiquette"
else
  echo "recevoir-image : image chargée ($etiquette), aucun script de relance à $RELANCER : relance à faire à la main." >&2
fi
echo "recevoir-image : ok $etiquette"
