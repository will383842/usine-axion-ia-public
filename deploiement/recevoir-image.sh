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
#    Le décodeur de docker (Go) accepte une clé dans n'importe quelle casse, écrite avec « \u », et même avec l'équivalence
#    unicode (« ſ » vaut « s ») : un simple grep sur "RepoTags" se contourne. On n'accepte donc que de l'ASCII imprimable,
#    sans barre oblique inverse, avec UNE seule clé « repotags » toutes casses confondues, et elle s'écrit exactement "RepoTags".
ascii_strict() { # $1 = texte, $2 = nom pour le message
  if LC_ALL=C grep -q '[^ -~]' <<< "$1"; then echec "$2 : caractère non ASCII ou de contrôle refusé"; fi
  if grep -q '\\' <<< "$1"; then echec "$2 : barre oblique inverse refusée"; fi
}
#    docker load extrait l'archive sur disque : si deux membres ont le même chemin, le dernier l'emporte, alors que « tar -xO »
#    ne rend que le premier. On liste donc l'archive d'abord : ASCII imprimable, aucun chemin absolu ni « .. », aucun chemin
#    en double une fois « ./ » retiré, et exactement un manifest.json à la racine (lu sous le nom exact de la liste).
liste="$(gunzip -c "$archive" | tar -t 2>/dev/null)" || echec "archive illisible"
ascii_strict "$liste" "liste des fichiers de l'archive"
normalise() { sed -e 's|/\{2,\}|/|g' -e ':a' -e 's|^\./||' -e 'ta'; }
while IFS= read -r membre; do
  case "$membre" in /*) echec "chemin absolu dans l'archive" ;; esac
  case "/$membre/" in */../*) echec "chemin qui remonte (..) dans l'archive" ;; esac
done <<< "$liste"
normalises="$(printf '%s\n' "$liste" | normalise | sed -e 's|/$||' | grep -v '^\.\?$' || true)"
[ -z "$(printf '%s\n' "$normalises" | sort | uniq -d)" ] || echec "chemin en double dans l'archive"
[ "$(printf '%s\n' "$normalises" | grep -cx 'manifest\.json')" -eq 1 ] || echec "manifest.json absent de l'archive ou en plusieurs exemplaires"
nom_manifeste="$(printf '%s\n' "$liste" | while IFS= read -r m; do if [ "$(printf '%s\n' "$m" | normalise)" = "manifest.json" ]; then printf '%s\n' "$m"; fi; done)"
manifeste="$(gunzip -c "$archive" | tar -xO "$nom_manifeste" 2>/dev/null)" || echec "manifest.json illisible"
ascii_strict "$manifeste" "manifest.json"
[ "$(printf '%s' "$manifeste" | grep -oi '"repotags"' | grep -c .)" -eq 1 ] || echec "une seule image attendue"
[ "$(printf '%s' "$manifeste" | grep -o '"RepoTags"' | grep -c .)" -eq 1 ] || echec "clé d'étiquettes écrite autrement que RepoTags"
etiquettes="$(printf '%s' "$manifeste" | grep -o '"RepoTags" *: *\[[^]]*\]' | grep -o '"[^"]*"' | tail -n +2 | tr -d '"')"
[ "$(printf '%s\n' "$etiquettes" | grep -c .)" -eq 1 ] || echec "une seule étiquette attendue"
printf '%s\n' "$etiquettes" | grep -Eq '^usine-axion-ia:ci-[0-9a-f]{40}$' || echec "étiquette refusée"
etiquette="$etiquettes"

#    Avec le stockage containerd, docker load étiquette aussi d'après index.json (annotations de noms) : même exigence,
#    chaque nom annoncé doit être l'étiquette du manifeste, sinon refus.
entrees_index="$(gunzip -c "$archive" | tar -t 2>/dev/null | grep -E '(^|/)index\.json$' || true)"
if [ -n "$entrees_index" ]; then
  [ "$(printf '%s\n' "$entrees_index" | grep -c .)" -eq 1 ] || echec "plusieurs index.json dans l'archive"
  case "$entrees_index" in index.json|./index.json) ;; *) echec "index.json hors de la racine de l'archive" ;; esac
  index="$(gunzip -c "$archive" | tar -xO "$entrees_index" 2>/dev/null)" || echec "index.json illisible"
  ascii_strict "$index" "index.json"
  noms="$(printf '%s' "$index" | grep -oE '"(io\.containerd\.image\.name|org\.opencontainers\.image\.ref\.name)" *: *("[^"]*"|[^ ,}]*)' | sed 's/^[^:]*: *//' | tr -d '"' || true)"
  while IFS= read -r nom; do
    [ -z "$nom" ] && continue
    [ "$nom" = "$etiquette" ] || [ "$nom" = "docker.io/library/$etiquette" ] || echec "nom d'image de index.json refusé"
  done <<< "$noms"
fi

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
