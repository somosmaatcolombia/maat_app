# MAAT — Guía: subir la app al servidor SIN Elementor

> Cómo servir las 3 apps como HTML estático directo desde tu hosting (el mismo servidor donde vive WordPress), eliminando Elementor del camino. **Sí mejora el rendimiento — y desbloquea cosas que con Elementor son imposibles.**

---

## 🎯 Por qué vale la pena

| Con Elementor (hoy) | Standalone (propuesto) |
|---------------------|------------------------|
| Carga WordPress + tema + Bootstrap + Elementor + tu app (≈1-3 MB extra) | Carga SOLO tu app (~200 KB) |
| Conflictos CSS del tema (el bug `.modal` de Bootstrap que sufrimos) | Cero conflictos — tu CSS es el único |
| Encoding Mac Roman → obligados a escapes `\uXXXX` | UTF-8 normal — se acabó el problema de acentos |
| No controlas el `<head>` → **Service Worker y manifest imposibles** | PWA completa: instalable + push reales |
| Editar = pegar 200 KB en un widget cada vez | Editar = subir 1 archivo por FTP (o script) |
| El SW no se puede registrar → **push muertas** | Push funcionando con la app cerrada |

**La razón de fondo:** la estrategia de re-enganche (Fases 1-2) depende de notificaciones push que alcancen al usuario con la app cerrada. Eso requiere un Service Worker servido junto al HTML — algo que un widget de Elementor no puede hacer. Este cambio no es solo performance: **es lo que enciende toda la maquinaria de retención.**

---

## 📂 Estructura en el servidor

Subir el contenido de `deploy/` a `public_html/` (la raíz del hosting):

```
public_html/                       ← raíz del hosting (donde vive WordPress)
├── wp-admin/ wp-content/ ...      ← WordPress sigue intacto
├── app/                           ← NUEVA: App del cliente (PWA)
│   ├── index.html
│   ├── sw.js
│   └── manifest.json
├── mentor/                        ← NUEVO: Portal del mentor
│   └── index.html
└── onboarding/                    ← NUEVA: Landing
    └── index.html
```

**URLs resultantes:**
- `https://www.somosmaat.org/app/` → App del cliente
- `https://www.somosmaat.org/mentor/` → Portal del mentor
- `https://www.somosmaat.org/onboarding/` → Landing

> WordPress NO interfiere: el servidor (Apache/LiteSpeed) sirve carpetas físicas ANTES de pasar la URL a WordPress. Mientras no exista una página de WordPress con el slug `app`, `mentor` u `onboarding`, no hay conflicto.

> 🔑 **Bonus de sesiones:** como es el mismo dominio, el `localStorage` y la sesión de Supabase se comparten — un usuario logueado en la versión Elementor seguirá logueado en `/app/`.

---

## 🚀 Pasos (15 minutos)

### 1. Generar la carpeta deploy
```bash
cd "Maat_app"
./build_deploy.sh
```

### 2. Subir al servidor — 2 opciones

**Opción A — cPanel File Manager (sin instalar nada):**
1. Entra al cPanel de tu hosting → **File Manager** → `public_html/`
2. Crea las carpetas `app`, `mentor`, `onboarding`
3. Sube los archivos de `deploy/app/` a `public_html/app/`, etc.

**Opción B — FTP (más rápido para actualizar):**
1. Consigue las credenciales FTP en cPanel → FTP Accounts
2. Con FileZilla (o `lftp` en terminal), arrastra `deploy/*` a `public_html/`

### 3. Actualizar las URLs en Supabase
**Authentication → URL Configuration → Redirect URLs**, agregar:
```
https://www.somosmaat.org/app/
https://www.somosmaat.org/app/*
https://somosmaat.org/app/
```
(Mantén las viejas de /dashboard mientras convivan ambas versiones.)

### 4. Actualizar el REDIRECT_URL de la landing
En `src/maat_landing.html`, cambiar:
```js
const REDIRECT_URL="https://www.somosmaat.org/dashboard";
```
por:
```js
const REDIRECT_URL="https://www.somosmaat.org/app/";
```
y regenerar deploy (paso 1) y resubir.

### 5. Probar la PWA
1. Abre `https://www.somosmaat.org/app/` en Chrome (móvil o desktop)
2. DevTools → Application → **Service Workers** → debe aparecer `sw.js` activo ✅
3. Application → **Manifest** → debe mostrar nombre MAAT e íconos ✅
4. En el móvil: menú Chrome → **"Agregar a pantalla de inicio"** → se instala como app real
5. Login → aceptar notificaciones → verificar en Supabase que `push_subscriptions` tiene una fila nueva ✅
6. Cerrar la app POR COMPLETO → invocar `send-notifications` (o esperar el cron) → debe llegar la push 🎉

### 6. Migración suave (sin romper a los usuarios actuales)
1. Deja `/dashboard` (Elementor) vivo unas semanas
2. En la página de WordPress `/dashboard`, agrega un aviso/redirect: *"Nos mudamos → somosmaat.org/app"* (o un redirect 301 desde cPanel)
3. Cuando confirmes que todos migraron, elimina la página de Elementor

---

## 🔁 Flujo de actualización de ahora en adelante

```
Editas src/maat_dashboard.html (con Claude)
        ↓
./build_deploy.sh
        ↓
Subes deploy/app/index.html por FTP (1 archivo, 10 segundos)
        ↓
Listo — sin tocar WordPress
```

> Cuando todo viva standalone, podremos **abandonar los escapes `\uXXXX`** y volver a UTF-8 legible (agregando `AddDefaultCharset utf-8` en `.htaccess` si hiciera falta). El código se vuelve mucho más fácil de mantener.

### Bonus opcional: `.htaccess` para `/app/` (caché + seguridad)
Crear `public_html/app/.htaccess`:
```apache
AddDefaultCharset utf-8
# El HTML siempre fresco; el SW nunca cacheado por proxies
<FilesMatch "\.(html|js|json)$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>
```
(El HTML es pequeño; preferimos frescura. Las imágenes pesadas viven en WP Media con su propio caché largo.)

---

## ⚠️ Qué NO cambia

- **WordPress sigue siendo tu CMS** para el sitio público (somosmaat.org)
- **Las imágenes siguen en WP Media** (URLs absolutas — funcionan igual)
- **Supabase no cambia nada** (mismo proyecto, mismas keys)
- **La landing puede seguir en Elementor si quieres** (no necesita SW) — aunque standalone carga más rápido

---

*Guía generada como parte de la auditoría técnica. Ver docs/AUDITORIA_TECNICA.md.*
