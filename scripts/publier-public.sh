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
)
# Variables secrètes : reconnues quelle que soit la casse (grep -i).
SECRETS_I=(
  '\b(SESSION_SECRET|NEXT_SERVER_ACTIONS_ENCRYPTION_KEY|USINE_PASSWORD_HASH_B64)[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9+/=_-]{16,}'
)
# Trace du dépôt privé des plans (même règle que L7-02), assemblée pour ne pas s'y reconnaître.
t1="axion"; t2="plans"; t3="prive"
TRACE_PRIVEE="$t1[-_ ]?$t2[-_ ]?$t3"
ADRESSE='\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b'
ADRESSES_PERMISES='@(example\.(com|org|net)|anthropic\.com|users\.noreply\.github\.com)$'
# Adresse de base locale : testée juste après le mot de passe (comme scripts/garde.mjs:37), jamais « n'importe où ».
BASE_LOCALE='^postgres(ql)?://[^:/]+:[^@]+@(localhost|127\.0\.0\.1|postgres)([:/]|$)'
BASE_AVEC_MDP='postgres(ql)?://[^:[:space:]/]+:[^@[:space:]]+@[^[:space:]"]*'
# Seuls bases/ permis hors de la racine : l'écran Réglages › Bases et les bases FICTIVES des essais. Tout autre bases/ est refusé, pas tu.
BASES_PERMISES=(src/app/reglages/bases tests/fixtures-bases/bases)
# Fichiers non texte permis (images, polices) ; tout autre fichier non texte (UTF-16, archive, binaire) est refusé.
EXT_BINAIRES='png|ico|woff|woff2|jpg|jpeg|gif|webp|avif'

# Liste des fichiers à copier (séparés par NUL) : jamais ./bases (racine, sans casse), .git, node_modules, secrets, sorties de build.
lister() {
  (cd "$1" && find . \
    \( -name .git -o -name node_modules -o -ipath ./bases -o -name .next -o -name '.next-*' \
       -o -path ./out -o -path ./build -o -path ./coverage \
       -o -name .npmrc -o \( -iname '.env*' ! -name .env.exemple \) \
       -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name 'id_rsa*' -o -name 'id_ed25519*' \
       -o -name 'ALERTE-BASES.txt' -o -name .DS_Store -o -name '*.tsbuildinfo' \) -prune \
    -o \( -type f -o -type l \) -print0)
}

# Aides de la garde : N compte les fautes (jamais de valeur affichée).
faute() { echo "FUITE : $1" >&2; N=$((N + 1)); }
# Lit « fichier NUL ligne:texte » (grep -Z -n) et appelle « $@ chemin ligne texte » pour chaque trouvaille.
chaque_trouvaille() {
  local f rest
  while IFS= read -r -d '' f && IFS= read -r rest; do "$@" "${f#"$DOSSIER"/}" "${rest%%:*}" "${rest#*:}"; done
}
cb_message() { faute "$MESSAGE : $1:$2"; }
cb_base() { [[ "$3" =~ $BASE_LOCALE ]] || faute "secret probable : $1:$2"; return 0; }
cb_adresse() {
  shopt -s nocasematch
  if ! [[ "$3" =~ $ADRESSES_PERMISES ]] && ! [[ "$3" =~ ^[^@]+@[0-9] ]]; then faute "adresse e-mail (utiliser @example.com) : $1:$2"; fi
  shopt -u nocasematch
  return 0
}
# Contrôle d'une liste de chemins (un par ligne, fichier $1) : jamais de valeur ni de chemin affichés, seulement le numéro de ligne.
chemins_motif() { # $1 = message ; reste = options et motif de grep
  local msg="$1" ln; shift
  while IFS=: read -r ln _; do faute "nom de fichier suspect ($msg) : ligne $ln de la liste"; done < <(grep -n "$@" "$CHEMINS" || true)
}

# Garde anti-fuite sur le dossier de passage : affiche « fichier:ligne : motif » (jamais la valeur trouvée), met le nombre de fautes dans FAUTES et renvoie 1 dès qu'il y en a une (un code de retour est pris modulo 256).
garde_fuites() {
  local dossier="$1" re f p ext
  DOSSIER="$dossier"; N=0; FAUTES=0; CHEMINS="$dossier.chemins"
  (cd "$dossier" && find . -mindepth 1 | sed 's|^\./||') > "$CHEMINS"
  # bases/ : seuls les emplacements permis (liste nommée) ; le reste est refusé, jamais tu.
  local args=(-iname bases)
  for p in "${BASES_PERMISES[@]}"; do args+=(! -path "$dossier/$p"); done
  if [ -n "$(find "$dossier" "${args[@]}" -print -quit)" ]; then faute "un bases/ hors des emplacements permis est dans la copie"; fi
  # Dossier ou fichier voisin de bases/ à la racine (bases.bak, bases-2025…) : refusé, sauf le témoin bases.source.json.
  if [ -n "$(find "$dossier" -maxdepth 1 -iname 'bases?*' ! -name bases.source.json -print -quit)" ]; then faute "un voisin de bases/ (bases?*) est à la racine de la copie"; fi
  while IFS= read -r f; do faute "lien symbolique refusé : ${f#"$dossier"/}"; done < <(find "$dossier" -type l)
  # Fichiers non texte : refusés hors de la liste d'extensions (UTF-16, archives, binaires ne se lisent pas).
  while IFS= read -r -d '' f; do
    ext="${f##*.}"; ext="${ext,,}"
    [[ "$f" == *.* ]] || ext=""
    local tete; tete="$(head -c4 "$f" | od -An -tx1 | tr -d ' \n')"
    if [[ "$ext" =~ ^($EXT_BINAIRES)$ ]]; then
      # Extension permise : l'en-tête est tout de même vérifié (archive renommée, faux .png).
      if [[ "$tete" == 1f8b* || "$tete" == 504b* ]] || { [ "$ext" = png ] && [ "$tete" != 89504e47 ]; }; then
        faute "fichier non texte ou compressé refusé (extension trompeuse) : ${f#"$dossier"/}"
      fi
      continue
    fi
    if [[ "$ext" =~ ^(gz|tgz|zip|tar|bz2|xz|7z|rar|zst)$ ]] || [[ "$tete" == 1f8b* || "$tete" == 504b* || "$tete" == fffe* || "$tete" == feff* ]] \
       || [ "$(LC_ALL=C tr -d '\000' < "$f" | wc -c)" != "$(wc -c < "$f")" ]; then
      faute "fichier non texte ou compressé refusé : ${f#"$dossier"/}"
    fi
  done < <(find "$dossier" -type f -print0)
  # Noms de personnes : liste hors dépôt (variable ou fichier), un nom par ligne ou séparés par « | ». Jamais affichée.
  # Bornes explicites (pas de grep -w : « _ » est une lettre pour lui) et casse « camel » (jeanNom).
  if [ -s "${LISTE_NOMS:-}" ]; then
    MESSAGE="nom interdit"
    chaque_trouvaille cb_message < <(grep -raniEZ -f "$LISTE_NOMS.re" "$dossier" || true)
    chaque_trouvaille cb_message < <(grep -ranEZ -f "$LISTE_NOMS.camel" "$dossier" || true)
    chemins_motif "nom interdit" -iE -f "$LISTE_NOMS.re"
    chemins_motif "nom interdit" -E -f "$LISTE_NOMS.camel"
  fi
  MESSAGE="secret probable"
  for re in "${SECRETS[@]}"; do
    chaque_trouvaille cb_message < <(grep -ranEZ -e "$re" "$dossier" || true)
    chemins_motif "secret" -E -e "$re"
  done
  for re in "${SECRETS_I[@]}"; do
    chaque_trouvaille cb_message < <(grep -raniEZ -e "$re" "$dossier" || true)
    chemins_motif "secret" -iE -e "$re"
  done
  # Adresse de base avec mot de passe, sauf locale (localhost, 127.0.0.1, postgres) testée juste après le mot de passe, comme scripts/garde.mjs.
  chaque_trouvaille cb_base < <(grep -ranoEZ -e "$BASE_AVEC_MDP" "$dossier" || true)
  while IFS=: read -r ln m; do [[ "$m" =~ $BASE_LOCALE ]] || faute "secret probable (nom de fichier) : ligne $ln de la liste"; done < <(grep -noE -e "$BASE_AVEC_MDP" "$CHEMINS" || true)
  MESSAGE="trace du dépôt privé"
  chaque_trouvaille cb_message < <(grep -raniEZ -e "$TRACE_PRIVEE" "$dossier" || true)
  chemins_motif "trace du dépôt privé" -iE -e "$TRACE_PRIVEE"
  # Adresses e-mail : seul le pnpm-lock.yaml de la racine y échappe (versions de paquets), et seulement pour ce motif.
  chaque_trouvaille cb_adresse < <(find "$dossier" -type f ! -path "$dossier/pnpm-lock.yaml" -print0 | xargs -0 -r grep -aHnoEZ -e "$ADRESSE" || true)
  while IFS=: read -r ln m; do
    shopt -s nocasematch
    if ! [[ "$m" =~ $ADRESSES_PERMISES ]] && ! [[ "$m" =~ ^[^@]+@[0-9] ]]; then faute "adresse e-mail dans un nom de fichier : ligne $ln de la liste"; fi
    shopt -u nocasematch
  done < <(grep -noE -e "$ADRESSE" "$CHEMINS" || true)
  FAUTES=$N
  if [ "$N" -gt 0 ]; then return 1; fi
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
  trap 'rm -rf "$passage" "$passage".*' RETURN
  lister "$source_dir" | tar -C "$source_dir" --null -T - -cf - | tar -C "$passage" -xf -

  # Liste des noms interdits, hors dépôt : variable PUBLIER_NOMS_INTERDITS (noms séparés par « | ») ou fichier PUBLIER_NOMS_INTERDITS_FICHIER.
  LISTE_NOMS="$passage.noms"
  : > "$LISTE_NOMS"
  if [ -n "${PUBLIER_NOMS_INTERDITS_FICHIER:-}" ] && [ -f "$PUBLIER_NOMS_INTERDITS_FICHIER" ]; then cat "$PUBLIER_NOMS_INTERDITS_FICHIER" >> "$LISTE_NOMS"; fi
  if [ -n "${PUBLIER_NOMS_INTERDITS:-}" ]; then printf '%s\n' "$PUBLIER_NOMS_INTERDITS" | tr '|' '\n' >> "$LISTE_NOMS"; fi
  # Fins de ligne CRLF (liste préparée sous Windows) : retirées, sinon aucun nom ne serait reconnu.
  # Espaces autour des noms (« Nom1 | Nom2 ») et BOM UTF-8 (liste préparée sous Windows) retirés aussi : sinon le nom serait perdu en silence.
  local bom=$'\xef\xbb\xbf'
  tr -d '\r' < "$LISTE_NOMS" | sed "s/^$bom//; s/^[[:space:]]*//; s/[[:space:]]*\$//; /^\$/d" > "$LISTE_NOMS.net"; mv "$LISTE_NOMS.net" "$LISTE_NOMS"
  # Expressions de recherche : nom entre deux non-lettres (sans casse), et nom collé après une minuscule (jeanNom).
  : > "$LISTE_NOMS.re"; : > "$LISTE_NOMS.camel"
  local nom echappe
  while IFS= read -r nom; do
    echappe="$(printf '%s' "$nom" | sed 's/[][\\.*^$(){}?+|\/]/\\&/g')"
    printf '(^|[^[:alpha:]])%s([^[:alpha:]]|$)\n' "$echappe" >> "$LISTE_NOMS.re"
    nom="${nom^}"; echappe="$(printf '%s' "$nom" | sed 's/[][\\.*^$(){}?+|\/]/\\&/g')"
    printf '[[:lower:]]%s([^[:alpha:]]|$)\n' "$echappe" >> "$LISTE_NOMS.camel"
    # Nom placé en tête (nomJean, NomJean) ou collé tout en capitales (JEANNOM, NOMJEAN).
    printf '(^|[^[:alpha:]])%s[[:upper:]]\n' "$echappe" >> "$LISTE_NOMS.camel"
    printf '(^|[^[:alpha:]])%s[[:upper:]]\n' "$(printf '%s' "${nom,}" | sed 's/[][\\.*^$(){}?+|\/]/\\&/g')" >> "$LISTE_NOMS.camel"
    echappe="$(printf '%s' "${nom^^}" | sed 's/[][\\.*^$(){}?+|\/]/\\&/g')"
    printf '[[:upper:]]%s([^[:alpha:]]|$)\n(^|[^[:alpha:]])%s[[:upper:]]\n' "$echappe" "$echappe" >> "$LISTE_NOMS.camel"
  done < "$LISTE_NOMS"
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
  export PUBLIER_NOMS_INTERDITS="Zz""fictif"
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
  local dom="reelle"".fr"
  source_saine; for i in $(seq 1 256); do echo "p$i@${dom}"; done > "$base/s/src/m.ts"
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
  source_saine; printf '//registry.example.com/:_auth%s=%s\n' Token "$(printf 'z%.0s' $(seq 1 12))" > "$base/s/.npmrc"
  bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || true
  verifie ".npmrc jamais copié" "$([ -e "$base/d/.npmrc" ] && echo 1 || echo 0)" 0
  source_saine; mkdir -p "$base/s/Bases"; echo x > "$base/s/Bases/a.md"
  bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || true
  verifie "Bases/ (casse) jamais copié" "$(find "$base/d" -ipath '*bases/*' | wc -l | tr -d ' ')" 0

  echo "3 ter. Relecture v2 : points 1 à 10, chacun rejoué (faux secrets et faux noms seulement)"
  local racine; racine="$(dirname "$moi")/.."
  local vingt; vingt="$(printf 'k%.0s' $(seq 1 20))"
  # 1. L'arbre du dépôt (script et doc compris, donnée d'essai assemblée) passe la garde ; le .npmrc d'essai est lui-même assemblé.
  rm -rf "$base/d"; mkdir -p "$base/d"
  code=0; bash "$moi" "$racine" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "1. l'arbre du dépôt passe la garde (à blanc)" "$code" 0
  # 2. Seul ./bases (racine) est écarté ; les bases/ permis sont copiés ; tout autre bases/ est refusé, pas tu.
  source_saine; mkdir -p "$base/s/src/app/reglages/bases" "$base/s/tests/fixtures-bases/bases"
  echo "export const p = 1;" > "$base/s/src/app/reglages/bases/page.tsx"; echo "base fictive" > "$base/s/tests/fixtures-bases/bases/a.md"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "2. bases/ permis : code 0" "$code" 0
  verifie "2. src/app/reglages/bases/page.tsx copié" "$([ -f "$base/d/src/app/reglages/bases/page.tsx" ] && echo 1 || echo 0)" 1
  verifie "2. tests/fixtures-bases/bases/a.md copié" "$([ -f "$base/d/tests/fixtures-bases/bases/a.md" ] && echo 1 || echo 0)" 1
  verifie "2. bases/ de la racine toujours écarté" "$([ -e "$base/d/bases" ] && echo 1 || echo 0)" 0
  source_saine; mkdir -p "$base/s/src/x/bases"; echo x > "$base/s/src/x/bases/a.md"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "2. autre bases/ : refus (code 1)" "$code" 1
  verifie "2. autre bases/ : destination vide" "$(find "$base/d" -type f | wc -l | tr -d ' ')" 0
  # 3. Adresse de base : l'exception locale se teste juste après le mot de passe.
  local ruse
  for ruse in "10.1.2.3:5432/db?x=@localhost/" "dbprod:5432/db#@postgres/" "dbprod:5432/db"; do
    source_saine; printf '%s://u:mdpreel@%s\n' postgres "$ruse" > "$base/s/src/b.ts"
    code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
    verifie "3. ruse locale « $ruse » : code 1" "$code" 1
  done
  source_saine; printf '%s://u:mdpreel@%s\n' postgres "dbprod:5432/db" > "$base/s/src/x:y:@postgres:z.ts"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "3. nom de fichier « @postgres » ne sauve pas l'adresse : code 1" "$code" 1
  source_saine; printf '%s://u:mdpreel@%s\n' postgres "localhost:5432/db" > "$base/s/src/b.ts"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "3. base vraiment locale : code 0" "$code" 0
  # 4. Les noms de fichiers sont contrôlés comme les contenus.
  local sk; sk="sk-ant-$(printf 'a%.0s' $(seq 1 30))"
  source_saine; echo x > "$base/s/src/$sk.txt"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "4. secret dans un nom de fichier : code 1" "$code" 1
  source_saine; echo x > "$base/s/src/$t1-$t2-$t3.md"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "4. trace privée dans un nom de fichier : code 1" "$code" 1
  source_saine; echo x > "$base/s/src/dupontel.md"
  code=0; PUBLIER_NOMS_INTERDITS="Dupontel" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "4. nom interdit dans un nom de fichier : code 1" "$code" 1
  # 5. Noms collés à « _ » ou en casse camel.
  for ruse in "auteur_dupontel" "jeanDupontel"; do
    source_saine; echo "// $ruse" > "$base/s/src/n.ts"
    code=0; PUBLIER_NOMS_INTERDITS="Dupontel" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
    verifie "5. « $ruse » : code 1" "$code" 1
  done
  # 6. UTF-16, archive et binaire hors liste refusés ; une image reste permise.
  source_saine; printf '%s' "$sk" | sed 's/./&\x00/g' > "$base/s/src/u.txt"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "6. secret en UTF-16 : code 1" "$code" 1
  source_saine; printf '%s\n' "$sk" | gzip -c > "$base/s/src/a.gz"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "6. secret dans une archive .gz : code 1" "$code" 1
  source_saine; printf '// %s-%s-%s\n' "$t1" "$t2" "$t3" | sed 's/./&\x00/g' > "$base/s/src/u.txt"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "6. trace privée en UTF-16 : code 1" "$code" 1
  source_saine; printf '\x89PNG\x00\x01' > "$base/s/src/i.png"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "6. image .png permise : code 0" "$code" 0
  # 7. Liste de noms en CRLF.
  source_saine; echo "// Dupontel" > "$base/s/src/n.ts"; printf 'Dupontel\r\n' > "$base/noms.txt"
  code=0; env -u PUBLIER_NOMS_INTERDITS PUBLIER_NOMS_INTERDITS_FICHIER="$base/noms.txt" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "7. liste de noms CRLF : code 1" "$code" 1
  # 8. Seul ./pnpm-lock.yaml échappe, et seulement au motif des adresses.
  source_saine; echo "$sk" > "$base/s/src/pnpm-lock.yaml"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "8. secret dans src/pnpm-lock.yaml : code 1" "$code" 1
  source_saine; printf 'mon@%s 1.2.3\n' "$dom" > "$base/s/pnpm-lock.yaml"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "8. pnpm-lock.yaml de la racine (adresses) : code 0" "$code" 0
  source_saine; echo "mon@$dom" > "$base/s/src/pnpm-lock.yaml"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "8. adresse dans src/pnpm-lock.yaml : code 1" "$code" 1
  # 9. Variantes de .env jamais copiées.
  source_saine; for ruse in .env-prod .env_prod .envrc .ENV.local; do echo "VALEUR=1" > "$base/s/$ruse"; done
  bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || true
  verifie "9. .env-prod .env_prod .envrc .ENV.local jamais copiés" "$(find "$base/d" -iname '.env*' ! -name .env.exemple | wc -l | tr -d ' ')" 0
  # 10. Variable secrète en minuscules.
  source_saine; printf 'session_%s = %s\n' secret "$vingt" > "$base/s/src/v.ts"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "10. variable secrète en minuscules : code 1" "$code" 1

  echo "3 quater. Relecture v3 : points 1 à 4 (faux noms seulement)"
  # 1. Espaces autour des noms et BOM UTF-8.
  local liste
  for liste in "Dupontel | Élodie" " Dupontel |Élodie " "Élodie | Dupontel"; do
    for ruse in "// Dupontel" "// Élodie"; do
      source_saine; echo "$ruse" > "$base/s/src/n.ts"
      code=0; PUBLIER_NOMS_INTERDITS="$liste" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
      verifie "1. liste « $liste », « $ruse » : code 1" "$code" 1
    done
  done
  source_saine; echo "x" > "$base/s/src/dupontel.md"
  code=0; PUBLIER_NOMS_INTERDITS="Élodie | Dupontel" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "1. « Nom1 | Nom2 » : nom en fin dans un nom de fichier : code 1" "$code" 1
  source_saine; echo "// Dupontel" > "$base/s/src/n.ts"; printf '\xef\xbb\xbfDupontel\r\nÉlodie\n' > "$base/noms.txt"
  code=0; env -u PUBLIER_NOMS_INTERDITS PUBLIER_NOMS_INTERDITS_FICHIER="$base/noms.txt" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "1. liste avec BOM : premier nom reconnu : code 1" "$code" 1
  source_saine; echo "// propre" > "$base/s/src/n.ts"
  code=0; PUBLIER_NOMS_INTERDITS="Dupontel | Élodie" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "1. liste avec espaces, source propre : code 0" "$code" 0
  # 2. Nom en tête ou en capitales collées.
  for ruse in "dupontelJean" "DupontelJean" "JEANDUPONTEL" "DUPONTELJEAN"; do
    source_saine; echo "// $ruse" > "$base/s/src/n.ts"
    code=0; PUBLIER_NOMS_INTERDITS="Dupontel" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
    verifie "2. « $ruse » : code 1" "$code" 1
  done
  source_saine; echo "// dupontelle propre" > "$base/s/src/n.ts"
  code=0; PUBLIER_NOMS_INTERDITS="Dupontel" bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "2. « dupontelle » (autre mot) : code 0" "$code" 0
  # 3. Voisins de bases/ à la racine.
  for ruse in bases.bak bases-2025; do
    source_saine; mkdir -p "$base/s/$ruse"; echo x > "$base/s/$ruse/a.md"
    code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
    verifie "3. $ruse/ à la racine : code 1" "$code" 1
    verifie "3. $ruse/ : destination vide" "$(find "$base/d" -type f | wc -l | tr -d ' ')" 0
  done
  # 4. En-tête vérifié même avec une extension permise.
  source_saine; printf '%s\n' "$sk" | gzip -c > "$base/s/src/a.png"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "4. gzip renommé .png : code 1" "$code" 1
  source_saine; printf 'x' | zip -q - - > "$base/s/src/f.woff2" 2>/dev/null || printf 'PK\x03\x04\x00\x00' > "$base/s/src/f.woff2"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "4. zip renommé .woff2 : code 1" "$code" 1
  source_saine; printf 'wOF2\x00\x01' > "$base/s/src/f.woff2"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "4. vrai .woff2 : code 0" "$code" 0
  source_saine; printf 'GIF89a\x00\x01' > "$base/s/src/i.png"
  code=0; bash "$moi" --ecrire "$base/s" "$base/d" >/dev/null 2>&1 || code=$?
  verifie "4. faux .png (signature absente) : code 1" "$code" 1

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
