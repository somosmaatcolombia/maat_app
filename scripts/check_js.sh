#!/bin/bash
# =====================================================
# MAAT - Verificacion del JS inline de cada pagina
# =====================================================
# Corre local (./scripts/check_js.sh) y en CI (deploy.yml).
# Por cada .html de src/ extrae su <script> inline y valida:
#   1. node --check           -> sintaxis
#   2. eslint no-undef        -> identificadores usados y nunca definidos
#      (la clase de bug del hotfix 42e4951: pickNotif/_notifTimer perdidos
#       en un reemplazo de bloque; sintaxis valida, referencia rota)
#   3. ASCII puro + escapes \uXXXXX rotos (emojis astrales sin llaves)
# Sale con codigo 1 si algo falla.
set -e
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0

# Globals que el browser o el CDN proveen y eslint no conoce
# (formato CLI: nombres a secas; "nombre:readonly" NO funciona en --no-eslintrc)
GLOBALS="supabase AdobeDC"

for f in src/*.html; do
  base="$(basename "$f" .html)"
  js="$TMP/$base.js"

  python3 - "$f" "$js" <<'PYEOF'
import sys,re
src,dst=sys.argv[1],sys.argv[2]
s=open(src,encoding='utf-8').read()
a=s.rindex('<script>')+len('<script>'); b=s.rindex('</script>')
open(dst,'w',encoding='utf-8').write(s[a:b])
# 3a. ASCII puro
if not all(ord(c)<128 for c in s):
    print(f"  ASCII FAIL: {src} contiene bytes no-ASCII"); sys.exit(2)
# 3b. escapes astrales rotos (Ὄ5 en vez de \u{1F4C5})
bad=re.findall(r'\\u1[0-9A-Fa-f]{4}(?![0-9A-Fa-f}])',s[a:b])
if bad:
    print(f"  ESCAPE FAIL: {src} tiene escapes de 5 digitos sin llaves: {bad[:3]}"); sys.exit(2)
PYEOF
  [ $? -ne 0 ] && FAIL=1 && continue

  # OJO: nada de pipes aqui — un `cmd | sed` devuelve el exit de sed y
  # enmascara el fallo real (nos paso en la primera version del script).
  if ! OUT=$(node --check "$js" 2>&1); then
    echo "$OUT" | sed "s|$TMP/|src/|"
    echo "  SINTAXIS FAIL: $f"; FAIL=1; continue
  fi

  # no-undef: cada archivo es autocontenido (Regla 1), asi que todo
  # identificador usado debe definirse en el mismo script o ser global browser.
  if ! OUT=$(npx --yes eslint@8.57.0 --no-eslintrc --env browser,es2022 \
        --parser-options ecmaVersion:2022 \
        --global "supabase" --global "AdobeDC" \
        --rule '{"no-undef":"error"}' "$js" 2>&1); then
    echo "$OUT" | sed "s|$TMP/|src/|"
    echo "  NO-UNDEF FAIL: $f"; FAIL=1; continue
  fi

  echo "  OK: $f"
done

exit $FAIL
