#!/usr/bin/env bash
# Commande forcée côté serveur : reçoit sur l'entrée standard une image Docker compressée (docker save | gzip),
# vérifie son étiquette dans l'archive, la charge, la marque « courante » puis relance l'Usine.
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

# 3. Contrôle de l'étiquette AVANT tout chargement : on lit manifest.json de l'archive (rien n'est chargé ni écrit dans docker).
#    Exactement une image, exactement une étiquette, et seule usine-axion-ia:ci-<sha complet> est acceptée.
manifeste="$(gunzip -c "$archive" | tar -xO manifest.json 2>/dev/null)" || echec "manifest.json absent de l'archive"
[ "$(printf '%s' "$manifeste" | grep -o '"RepoTags"' | grep -c .)" -eq 1 ] || echec "une seule image attendue"
etiquettes="$(printf '%s' "$manifeste" | grep -o '"RepoTags" *: *\[[^]]*\]' | grep -o '"[^"]*"' | tail -n +2 | tr -d '"')"
[ "$(printf '%s\n' "$etiquettes" | grep -c .)" -eq 1 ] || echec "une seule étiquette attendue"
printf '%s\n' "$etiquettes" | grep -Eq '^usine-axion-ia:ci-[0-9a-f]{40}$' || echec "étiquette refusée"
etiquette="$etiquettes"

# 4. Chargement, puis recoupement : docker doit annoncer la même étiquette que le manifeste.
sortie="$(gunzip -c "$archive" | docker load)"
[ "$(printf '%s\n' "$sortie" | sed -n 's/^Loaded image: //p')" = "$etiquette" ] || echec "étiquette chargée différente du manifeste"

# 5. Étiquette courante, puis relance. Sans script de relance la relance n'a PAS eu lieu : sortie 3, jamais « ok ».
docker tag "$etiquette" "usine-axion-ia:courant"
if [ ! -x "$RELANCER" ]; then
  echo "recevoir-image : image chargée ($etiquette) mais aucun script de relance à $RELANCER : relance NON faite." >&2
  exit 3
fi
"$RELANCER" "$etiquette"
echo "recevoir-image : ok $etiquette"
