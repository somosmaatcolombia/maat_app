#!/bin/bash
# =====================================================
# MAAT - Construye la carpeta deploy/ lista para subir
# al servidor por FTP / cPanel File Manager.
#
# Uso:  ./build_deploy.sh           (minifica los .html si hay npx)
#       ./build_deploy.sh --no-minify
# Resultado:  deploy/app/  deploy/mentor/  deploy/onboarding/
# =====================================================
set -e
cd "$(dirname "$0")"

MINIFY=1
[ "$1" = "--no-minify" ] && MINIFY=0

rm -rf deploy
mkdir -p deploy/app deploy/mentor deploy/onboarding

# App del cliente (PWA completa: index + service worker + manifest)
cp src/maat_dashboard.html      deploy/app/index.html
cp src/sw.js                    deploy/app/sw.js
cp src/manifest.json            deploy/app/manifest.json

# Portal del mentor
cp src/maat_mentor_dashboard.html  deploy/mentor/index.html

# Landing de onboarding
cp src/maat_landing.html        deploy/onboarding/index.html

# Minificacion (opcional): reduce el peso de los .html ~15%.
# ascii_only:true preserva la regla de archivos ASCII puro (\uXXXX en vez de UTF-8 crudo).
if [ "$MINIFY" = "1" ] && command -v npx >/dev/null 2>&1; then
  echo "Minificando .html ..."
  for f in deploy/app/index.html deploy/mentor/index.html deploy/onboarding/index.html; do
    npx --yes html-minifier-terser \
      --collapse-whitespace --conservative-collapse --remove-comments \
      --minify-css true \
      --minify-js '{"output":{"ascii_only":true}}' \
      "$f" -o "$f.tmp" && mv "$f.tmp" "$f"
  done
else
  echo "Minificacion omitida (usa --no-minify o instala npx para activarla)."
fi

echo ""
echo "deploy/ generado:"
find deploy -type f | sort
echo ""
echo "Siguiente paso: subir el contenido de deploy/ a public_html/ del servidor."
echo "Ver deploy/README_DEPLOY.md (se copia a continuacion)."

cp docs/GUIA_DEPLOY_SERVIDOR.md deploy/README_DEPLOY.md 2>/dev/null || true
