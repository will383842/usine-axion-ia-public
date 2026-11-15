#!/usr/bin/env bash
# Recopie à sens unique de l'Usine vers le dépôt public (L7-32), hors bases/, avec garde anti-fuite avant toute copie.
# Usage : scripts/publier-public.sh [--ecrire] <dossier source> <dossier destination>
#         scripts/publier-public.sh --essai        (essai intégré, aucun appel réseau, rien hors d'un dossier temporaire)
# Sans --ecrire : recopie « à blanc » (liste ce qui serait copié, contrôle tout, n'écrit rien dans la destination).
# Jamais de suppression : un fichier de la destination absent de la source reste en place (il est signalé).
set -euo pipefail

# Motifs de secret : mêmes familles que scripts/garde.mjs (les fragments sont assemblés ici pour ne pas se reconnaître eux-mêmes).
CLE_PRIVEE="-----BEGIN [A-Z ]*PRIVATE"" KEY-----"
SECRETS=(
  "$CLE_PRIVEE"
  '\bgh[pousr]_[A-Za-z0-9]{30,}'
  '\bgithub_pat_[A-Za-z0-9_]{30,}'
  '\bsk-ant-[A-Za-z0-9_-]{20,}'
  '\bsk-[A-Za-z0-9]{32,}'
  '\bAKIA[0-9A-Z]{16}\b'
  '\bxox[abprs]-[A-Za-z0-9-]{10,}'
  '\$argon2id\$v=[0-9]+\$[^ "]+'
  '\bJGFyZ29uMmlk[A-Za-z0-9+/=]{20,}'
  '\bnpm_[A-Za-z0-9]{30,}'
  '_authToken[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9_+/=-]{8,}'
  '\b(SESSION_SECRET|NEXT_SERVER_ACTIONS_ENCRYPTION_KEY|USINE_PASSWORD_HASH_B64)[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9+/=_-]{16,}'
)
# Trace du dépôt privé des plans (même règle que L7-02), assemblée pour ne pas s'y reconnaître.
t1="axion"; t2="plans"; t3="prive"
TRACE_PRIVEE="$t1[-_ ]?$t2[-_ ]?$t3"
ADRESSE='\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b'
ADRESSES_PERMISES='@(example\.(com|org|net)|anthropic\.com|users\.noreply\.github\.com)$'

# Liste des fichiers à copier (séparés par NUL) : jamais bases/, .git, node_modules, secrets, sorties de build.
lister() {
  (cd "$1" && find . \
    \( -name .git -o -name node_modules -o -iname bases -o -name .next -o -name '.next-*' \
       -o -path ./out -o -path ./build -o -path ./coverage \
       -o -name .npmrc -o -name .env -o \( -name '.env.*' ! -name .env.exemple \) \
       -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name 'id_rsa*' -o -name 'id_ed25519*' \
       -o -name 'ALERTE-BASES.txt' -o -name .DS_Store -o -name '*.tsbuildinfo' \) -prune \
    -o \( -type f -o -type l \) -print0)
}

# Garde anti-fuite sur le dossier de passage : affiche « fichier:ligne : motif » (jamais la valeur trouvée), met le nombre de fautes dans FAUTES et renvoie 1 dès qu'il y en a une (un code de retour est pris modulo 256).
garde_fuites() {
  local dossier="$1" n=0 l re
  FAUTES=0
  if [ -n "$(find "$dossier" \( -iname bases -o -ipath '*/bases/*' \) -print -quit)" ]; then
    echo "FUITE : un fichier de bases/ est dans la copie" >&2; n=$((n + 1))
  fi
  while IFS= read -r l; do echo "FUITE : lien symbolique refusé : ${l#"$dossier"/}" >&2; n=$((n + 1)); done < <(find "$dossier" -type l)
  # Noms de personnes : liste hors dépôt (variable ou fichier), un nom par ligne ou séparés par « | ». Jamais affichée.
  if [ -s "${LISTE_NOMS:-}" ]; then
    while IFS= read -r l; do echo "FUITE : nom interdit : ${l#"$dossier"/}" >&2; n=$((n + 1)); done \
      < <( (grep -raniF -w -f "$LISTE_NOMS" "$dossier" || true) | cut -d: -f1,2)
  fi
  for re in "${SECRETS[@]}"; do
    while IFS= read -r l; do echo "FUITE : secret probable : ${l#"$dossier"/}" >&2; n=$((n + 1)); done \
      < <( (grep -ranE --exclude=pnpm-lock.yaml -e "$re" "$dossier" || true) | cut -d: -f1,2)
  done
  # Adresse de base avec mot de passe, sauf locale (localhost, 127.0.0.1, postgres) comme dans scripts/garde.mjs.
  while IFS= read -r l; do
    local m="${l#*:*:}"
    if ! [[ "$m" =~ @(localhost|127\.0\.0\.1|postgres)([:/]|$) ]]; then
      echo "FUITE : secret probable : $(cut -d: -f1,2 <<<"${l#"$dossier"/}")" >&2; n=$((n + 1))
    fi
  done < <(grep -ranoE --exclude=pnpm-lock.yaml -e 'postgres(ql)?://[^:[:space:]/]+:[^@[:space:]]+@[^[:space:]"]*' "$dossier" || true)
  while IFS= read -r l; do echo "FUITE : trace du dépôt privé : ${l#"$dossier"/}" >&2; n=$((n + 1)); done \
    < <( (grep -ranEi --exclude=pnpm-lock.yaml -e "$TRACE_PRIVEE" "$dossier" || true) | cut -d: -f1,2)
  while IFS= read -r l; do
    local m="${l##*:}" ou="${l%:*}"
    shopt -s nocasematch
    if ! [[ "$m" =~ $ADRESSES_PERMISES ]] && ! [[ "$m" =~ ^[^@]+@[0-9] ]]; then
      echo "FUITE : adresse e-mail (utiliser @example.com) : ${ou#"$dossier"/}" >&2; n=$((n + 1))
    fi
    shopt -u nocasematch
  done < <(grep -ranoE --exclude=pnpm-lock.yaml -e "$ADRESSE" "$dossier" || true)
  FAUTES=$n
  if [ "$n" -gt 0 ]; then return 1; fi
  return 0
}

recopier() {
  local ecrire=0
  if [ "${1:-}" = "--ecrire" ]; then ecrire=1; shift; fi
  local source_dir="${1:-}" cible="${2:-}"
  if [ -z "$source_dir" ] || [ -z "$cible" ] || [ ! -d "$source_dir" ] || [ ! -d "$cible" ]; then
    echo "Source ou destination introuvable. Usage : scripts/publier-public.sh [--ecrire] <source> <destination>" >&2; return 1
  fi
  source_dir="$(cd "$source_dir" && pwd -P)"; cible="$(cd "$cible" && pwd -P)"
  case "$source_dir/" in "$cible"/*) echo "La source ne peut pas être dans la destination." >&2; return 1;; esac
  case "$cible/" in "$source_dir"/*) echo "La destination ne peut pas être dans la source." >&2; return 1;; esac

  local passage; passage="$(mktemp -d)"
  trap 'rm -rf "$passage" "$passage.noms"' RETURN
  lister "$source_dir" | tar -C "$source_dir" --null -T - -cf - | tar -C "$passage" -xf -

  # Liste des noms interdits, hors dépôt : variable PUBLIER_NOMS_INTERDITS (noms séparés par « | ») ou fichier PUBLIER_NOMS_INTERDITS_FICHIER.
  LISTE_NOMS="$passage.noms"
  : > "$LISTE_NOMS"
  if [ -n "${PUBLIER_NOMS_INTERDITS_FICHIER:-}" ] && [ -f "$PUBLIER_NOMS_INTERDITS_FICHIER" ]; then cat "$PUBLIER_NOMS_INTERDITS_FICHIER" >> "$LISTE_NOMS"; fi
  if [ -n "${PUBLIER_NOMS_INTERDITS:-}" ]; then printf '%s\n' "$PUBLIER_NOMS_INTERDITS" | tr '|' '\n' >> "$LISTE_NOMS"; fi
  sed -i '/^[[:space:]]*$/d' "$LISTE_NOMS"
  if [ ! -s "$LISTE_NOMS" ]; then
    if [ "$ecrire" -eq 1 ]; then
      echo "Refus : la liste des noms interdits est absente (PUBLIER_NOMS_INTERDITS ou PUBLIER_NOMS_INTERDITS_FICHIER, hors dépôt). Rien n'a été copié." >&2; return 1
    fi
    echo "Attention : liste des noms interdits absente, le contrôle des noms n'a pas eu lieu (obligatoire avec --ecrire)." >&2
  fi
  garde_fuites "$passage" || true
  if [ "$FAUTES" -gt 0 ]; then
    echo "Garde anti-fuite : $FAUTES faute(s). Rien n'a été copié." >&2; return 1
  fi

  local total; total="$(find "$passage" -type f | wc -l | tr -d ' ')"
  (cd "$passage" && find . -type f | sort | sed 's|^\./||') | while IFS= read -r f; do
    if [ ! -f "$cible/$f" ]; then echo "nouveau : $f"; elif ! cmp -s "$passage/$f" "$cible/$f"; then echo "modifié : $f"; fi
  done
  (cd "$cible" && find . -type f -not -path './.git/*' -not -path './node_modules/*' | sed 's|^\./||') | while IFS= read -r f; do
    [ -f "$passage/$f" ] || echo "absent de la source (gardé) : $f"
  done

  if [ "$ecrire" -eq 1 ]; then
    tar -C "$passage" -cf - . | tar -C "$cible" -xf -
    echo "$total fichier(s) recopié(s), aucun de bases/. Relisez « git diff » dans la destination, puis livrez."
  else
    echo "À blanc : $total fichier(s) recopiables, aucun de bases/, rien n'a été écrit. Relancez avec --ecrire."
  fi
}

# ---------------------------------------------------------------------------------------------------------------------
# Essai intégré (--essai) : bases fictives, aucun appel réel. Chaque cas doit réussir, sinon code 1.
# ---------------------------------------------------------------------------------------------------------------------
essai() {
  local moi; moi="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
  local base; base="$(mktemp -d)"
  trap 'rm -rf "$base"' RETURN
  local echecs=0
  export PUBLIER_NOMS_INTERDITS="Zzfictif"
  verifie() { if [ "$2" -eq "$3" ]; then echo "  ok : $1"; else echo "  ROUGE : $1 (attendu $3, obtenu $2)" >&2; echecs=$((echecs + 1)); fi; }
  dossier_neuf() { rm -rf "$base/s" "$base/d"; mkdir -p "$base/s/src" "$base/s/bases" "$base/s/node_modules/x" "$base/s/.git" "$base/d"; }
  source_saine() {
    dossier_neuf
    echo "export const a = 1;" > "$base/s/src/a.ts"
    echo '{"empreinte":"abc"}' > "$base/s/bases.source.json"
    echo "VAR=" > "$base/s/.env.exemple"
    echo "contact@example.com Contact@Example.COM postgres://postgres:postgres@localhost:5432/essai" > "$base/s/README.md"
    echo "base fictive" > "$base/s/bases/secret.md"
    echo "x" > "$base/s/node_modules/x/i.js"; echo "x" > "$base/s/.git/config"
    echo "VALEUR=1" > "$base/s/.env"; echo "x" > "$base/s/cle.pem"
  }
  local sortie code

  echo "1. À blanc sain : tout passe, rien d'écrit, aucun fichier de bases/"
  source_saine
  code=0; sortie="$(bash "$moi" "$base/s" "$base/d" 2>&1)" || code=$?
  verifie "code 0" "$code" 0
  verifie "rien d'écrit dans la destination" "$(find "$base/d" -type f | wc -l | tr -d ' ')" 0
  verifie "la source apparaît dans la liste" "$(grep -c 'nouveau : src/a.ts' <<<"$sortie" || true)" 1
  verifie "aucun fichier de bases/ listé" "$(grep -cE '^(nouveau|modifié) : bases/' <<<"$sortie" || true)" 0
  verifie "aucun .env ni clé ni .git listé" "$(grep -cE ': (\.env$|cle\.pem|\.git/|node_modules/)' <<<"$sortie" || true)" 0

  echo "2. Recopie réelle : sans bases/, avec .env.exemple, sans secret"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "code 0" "$code" 0
  verifie "src/a.ts copié" "$([ -f "$base/d/src/a.ts" ] && echo 1 || echo 0)" 1
  verifie ".env.exemple copié" "$([ -f "$base/d/.env.exemple" ] && echo 1 || echo 0)" 1
  verifie "aucun fichier de bases/ dans la destination" "$(find "$base/d" -path '*/bases/*' -o -name bases | wc -l | tr -d ' ')" 0
  verifie ".env absent de la destination" "$([ -e "$base/d/.env" ] && echo 1 || echo 0)" 0

  echo "3. Un secret, une trace privée, une adresse réelle ou un lien : refus, rien copié"
  local fuite
  for fuite in secret trace adresse lien base; do
    source_saine
    case "$fuite" in
      secret) printf 'jeton=gh%s_%s\n' p "$(printf 'a%.0s' $(seq 1 36))" > "$base/s/src/b.ts";;
      trace) printf '// voir %s-%s-%s\n' "$t1" "$t2" "$t3" > "$base/s/src/b.ts";;
      adresse) printf 'contact: personne@%s.fr\n' "reelle" > "$base/s/src/b.ts";;
      base) printf 'url=%s://u:mdp@%s.fr:5432/x\n' postgres serveur > "$base/s/src/b.ts";;
      lien) ln -s "$base/s/bases/secret.md" "$base/s/src/b.md";;
    esac
    code=0; sortie="$(bash "$moi" --ecrire "$base/s" "$base/d" 2>&1)" || code=$?
    verifie "$fuite : code 1" "$code" 1
    verifie "$fuite : destination vide" "$(find "$base/d" -type f | wc -l | tr -d ' ')" 0
    verifie "$fuite : la valeur n'est jamais affichée" "$(grep -cE 'aaaaaaaa|personne@|mdp@' <<<"$sortie" || true)" 0
  done

  echo "3 bis. Contournements rejoués : 256 fautes, nom, binaire, jeton npm, casse de bases/"
  local i
  source_saine; for i in $(seq 1 256); do echo "p$i@reelle.fr"; done > "$base/s/src/m.ts"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "256 adresses réelles : code 1 (pas de repli modulo 256)" "$code" 1
  verifie "256 adresses réelles : destination vide" "$(find "$base/d" -type f | wc -l | tr -d ' ')" 0
  source_saine; echo "// Auteur : Prenom Nomfictif" > "$base/s/src/n.ts"
  code=0; PUBLIER_NOMS_INTERDITS="Nomfictif" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "nom interdit : code 1" "$code" 1
  code=0; env -u PUBLIER_NOMS_INTERDITS -u PUBLIER_NOMS_INTERDITS_FICHIER bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "--ecrire sans liste de noms : refus" "$code" 1
  source_saine; printf 'sk-ant-%s\n' "$(printf 'a%.0s' $(seq 1 30))" > "$base/s/src/x.bin"; printf '\0' >> "$base/s/src/x.bin"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "secret dans un binaire : code 1" "$code" 1
  source_saine; printf 'x=npm_%s\n' "$(printf 'c%.0s' $(seq 1 36))" > "$base/s/src/t.ts"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "jeton npm : code 1" "$code" 1
  source_saine; echo "//registry.example.com/:_authToken=zzzzzzzzzzzz" > "$base/s/.npmrc"
  bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || true
  verifie ".npmrc jamais copié" "$([ -e "$base/d/.npmrc" ] && echo 1 || echo 0)" 0
  source_saine; mkdir -p "$base/s/Bases"; echo x > "$base/s/Bases/a.md"
  bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || true
  verifie "Bases/ (casse) jamais copié" "$(find "$base/d" -ipath '*bases/*' | wc -l | tr -d ' ')" 0

  echo "4. Jamais de suppression, destination invalide refusée"
  source_saine
  echo "ancien" > "$base/d/vieux.txt"
  bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || true
  verifie "fichier de la destination absent de la source conservé" "$([ -f "$base/d/vieux.txt" ] && echo 1 || echo 0)" 1
  code=0; bash "$moi" "$base/s" "$base/s" >/dev/null 2>&1 || code=$?
  verifie "source = destination refusée" "$code" 1
  code=0; bash "$moi" "$base/inexistant" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "source introuvable refusée" "$code" 1

  if [ "$echecs" -gt 0 ]; then echo "Essai ROUGE : $echecs cas en échec." >&2; return 1; fi
  echo "Essai VERT : tous les cas passent (bases fictives, aucun appel réel)."
}

if [ "${1:-}" = "--essai" ]; then essai; else recopier "$@"; fi
