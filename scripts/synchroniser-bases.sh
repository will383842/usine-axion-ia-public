#!/usr/bin/env bash
# Copie les bases qui font foi (axion-plans-prive/usine/bases/pour-la-machine/) dans bases/ et dit ce qui a changé.
# bases/ ne se modifie jamais à la main : on corrige la copie qui fait foi, puis on relance ce script.
# Usage : scripts/synchroniser-bases.sh [dossier source]
# (par défaut ../axion-plans-prive/usine/bases/pour-la-machine, à côté de ce dépôt). Rien n'est retiré de bases/.
set -euo pipefail

racine="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="${1:-$racine/../axion-plans-prive/usine/bases/pour-la-machine}"
cible="$racine/bases"

if [ ! -d "$source_dir" ]; then
  echo "Copie qui fait foi introuvable : $source_dir" >&2
  echo "Clonez will383842/axion-plans-prive à côté de ce dépôt, ou donnez le dossier en argument." >&2
  exit 1
fi

mkdir -p "$cible"
changes=0
shopt -s nullglob
for f in "$source_dir"/*.md; do
  nom="$(basename "$f")"
  if [ ! -f "$cible/$nom" ]; then
    cp "$f" "$cible/$nom"
    echo "nouveau : bases/$nom"
    changes=$((changes + 1))
  elif ! cmp -s "$f" "$cible/$nom"; then
    lignes="$(diff "$cible/$nom" "$f" | grep -c '^[<>]' || true)"
    cp "$f" "$cible/$nom"
    echo "modifié : bases/$nom ($lignes lignes changées)"
    changes=$((changes + 1))
  fi
done

for f in "$cible"/*.md; do
  nom="$(basename "$f")"
  [ -f "$source_dir/$nom" ] || echo "absent de la copie qui fait foi (gardé) : bases/$nom"
done

# Témoin de la copie (bases.source.json) : réécrit à chaque synchro, jamais à la main.
node "$racine/scripts/ecrire-temoin-bases.mjs" "$source_dir"

if [ "$changes" -eq 0 ]; then
  echo "Bases à jour : rien n'a changé."
else
  echo "$changes fichier(s) copié(s). Relisez « git diff bases/ », puis commitez."
fi
