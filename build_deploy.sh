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
mkdir -p deploy/app deploy/mentor deploy/onboarding deploy/feedback deploy/feedback-panel deploy/biotipo

# App del cliente (PWA completa: index + service worker + manifest + iconos)
cp src/maat_dashboard.html      deploy/app/index.html
cp src/sw.js                    deploy/app/sw.js
# Versionar la cache del SW por build: con el nombre fijo ("maat-v2") la PWA
# instalada seguia sirviendo el HTML viejo aunque el server ya tuviera el nuevo.
BUILD_TAG="maat-$(date +%Y%m%d%H%M)"
sed -i.bak "s/const CACHE_NAME = \"maat-v2\"/const CACHE_NAME = \"$BUILD_TAG\"/" deploy/app/sw.js && rm -f deploy/app/sw.js.bak
grep -q "$BUILD_TAG" deploy/app/sw.js || { echo "ERROR: no se pudo versionar CACHE_NAME"; exit 1; }
cp src/manifest.json            deploy/app/manifest.json
cp src/icon-192.png src/icon-512.png src/icon-maskable-512.png src/apple-touch-icon.png deploy/app/

# Portal del mentor
cp src/maat_mentor_dashboard.html  deploy/mentor/index.html

# Landing de onboarding
cp src/maat_landing.html        deploy/onboarding/index.html

# Cuestionario de trazabilidad (cliente). DEBE ir en el mismo dominio que /app/
# para compartir la sesion de Supabase (ver CONFIG.FEEDBACK_URL en la app).
cp src/maat_feedback.html       deploy/feedback/index.html

# Dashboard de feedback (mentor/admin)
cp src/maat_feedback_dashboard.html deploy/feedback-panel/index.html

# Cuestionario de Biotipo (lead magnet + guarda en perfil). DEBE ir en el mismo
# dominio que /app/ para compartir la sesion de Supabase (guardar en perfil).
cp src/maat_biotipo.html        deploy/biotipo/index.html

# /dashboard/ -> /app/ : la copia vieja embebida en Elementor quedo congelada
# (el deploy FTP no la toca). Una carpeta FISICA gana sobre la pagina de
# WordPress (el server sirve directorios antes de pasar la URL a WP), asi que
# este redirect entierra la version congelada sin tocar WordPress.
mkdir -p deploy/dashboard
cat > deploy/dashboard/.htaccess <<'HTACCESS'
RedirectMatch 301 ^/dashboard/?$ /app/
HTACCESS
cat > deploy/dashboard/index.html <<'HTML'
<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>MAAT</title>
<meta http-equiv="refresh" content="0;url=/app/">
<link rel="canonical" href="https://somosmaat.org/app/">
<script>location.replace("/app/");</script>
</head><body><p>Nos mudamos: <a href="/app/">somosmaat.org/app</a></p></body></html>
HTML

# .htaccess por carpeta: evita que las caches (LiteSpeed / proxy / navegador)
# sirvan HTML viejo tras un deploy. El HTML es pequenio: preferimos frescura.
# NOTA: esto solo afecta a DESPUES de purgar la cache actual una vez.
for d in app mentor onboarding feedback feedback-panel biotipo; do
  cat > "deploy/$d/.htaccess" <<'HTACCESS'
AddDefaultCharset utf-8
<IfModule mod_headers.c>
  <FilesMatch "\.(html|js|json)$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>
</IfModule>
<IfModule LiteSpeed>
  CacheDisable public /
</IfModule>
HTACCESS
done

# Minificacion (opcional): reduce el peso de los .html ~15%.
# ascii_only:true preserva la regla de archivos ASCII puro (\uXXXX en vez de UTF-8 crudo).
if [ "$MINIFY" = "1" ] && command -v npx >/dev/null 2>&1; then
  echo "Minificando .html ..."
  for f in deploy/app/index.html deploy/mentor/index.html deploy/onboarding/index.html \
           deploy/feedback/index.html deploy/feedback-panel/index.html deploy/biotipo/index.html; do
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
