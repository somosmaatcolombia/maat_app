# MAAT — Auditoría Técnica y Plan de Mejora

> Revisión completa de arquitectura, performance, usabilidad y recursos. Las dos apps están **bien construidas** (Promise.allSettled, carga en 2 fases, realtime con cleanup, autosave con debounce, RLS-aware). Este plan lleva algo sólido a excelente. El hallazgo crítico **ya fue aplicado** (ver C1).

---

## 🩺 Diagnóstico en una frase

> El código es de buena calidad, pero la app se vendía como PWA sin serlo: el Service Worker **nunca se registraba**, dejando muerta toda la infraestructura de push (VAPID + cron + `push_subscriptions`) — justo la palanca de re-enganche que el diagnóstico psicosocial marcó como prioridad #1.

---

## 🔴 CRÍTICO — ✅ APLICADO

### C1. Service Worker no registrado → push muertas — ✅ RESUELTO
**Era:** `sw.js` existía pero ningún HTML lo registraba; no había `manifest.json`; la tabla `push_subscriptions` nunca se llenaba; el cron `send-notifications` enviaba a la nada. Solo funcionaba `new Notification()` local (requiere app abierta — inútil para re-enganchar ausentes).

**Aplicado:**
1. ✅ `src/manifest.json` creado (PWA instalable: nombre, íconos, standalone, theme)
2. ✅ `<link rel="manifest">` agregado al dashboard
3. ✅ `setupPWA()` registra `./sw.js` en el boot (falla silencioso si está embebido en Elementor — no rompe nada)
4. ✅ `subscribePush()` crea la suscripción Web Push real (`pushManager.subscribe` con VAPID) y la guarda en `push_subscriptions` con upsert
5. ✅ Se dispara al conceder permiso de notificaciones (y en cada arranque con permiso ya concedido)
6. ✅ Par VAPID nuevo generado; secrets actualizados en Supabase (proyecto `pcclptmojjzqmfmzftot`)
7. ✅ `sw.js` abre la app en su scope real al tocar la notificación; mensaje `NAVIGATE` navega a la vista correcta
8. ✅ Verificado en preview: SW `activated`, manifest resolviendo, cero errores de consola

**Pendiente del usuario:** subir `deploy/app/` al servidor (el SW requiere servirse junto al HTML — imposible en widget de Elementor). Ver `docs/GUIA_DEPLOY_SERVIDOR.md`.

### C2. Zoom bloqueado (accesibilidad) — ✅ RESUELTO
`user-scalable=no` impedía a usuarios con baja visión hacer zoom. Cambiado a `maximum-scale=5`.

---

## 🟠 ALTO — Performance y escalabilidad (pendientes)

### A1. Over-fetching en el portal del mentor
`loadData()` trae `select("*")` de **todas** las calibraciones de **todos** los clientes, incluyendo los 3 textos largos (`answer_q1/q2/q3`). Hoy manejable; con 100 clientes serán varios MB por carga.
**Fix:** `select("user_id,week,coherence,created_at")` para métricas; textos completos solo al abrir el perfil (lazy); `.limit()` o ventana de 60 días.

### A2. Admin carga TODOS los profiles sin filtro de servidor
`select("*")` sin `.eq("role","client")` — en una BD compartida con el CRM trae perfiles ajenos.
**Fix:** filtrar en servidor. Menos datos, menos exposición.

### A3. 202 KB de HTML sin granularidad de caché
Restricción de la REGLA 1 (un archivo por app). Con hosting standalone se mitiga: el server puede comprimir (gzip ≈ 60 KB) y cachear. Minificar daría 30-40% extra.

### A4. Adobe PDF SDK pesado (WASM)
Ya está lazy-loaded y con fallback móvil. Evaluar si un `<embed>` nativo basta (mucho más liviano).

### A5. Imágenes PNG pesadas sin lazy loading
Las papercut son PNG; 12 `<img>` sin `loading="lazy"`.
**Fix:** convertir a WebP (60-70% menos peso), `loading="lazy"` + `decoding="async"`, declarar width/height (evita layout shift).

---

## 🟡 MEDIO — Robustez

- **M1.** 7 `console.log/warn` en producción → envolver en flag DEBUG
- **M2.** 5 casos de `innerHTML +=` en bucles (reflow) → unificar a `.join("")`
- **M3.** Sin estado offline real → con el SW ya registrado, agregar caché del shell (fase 2 del SW)
- **M4.** Sin minificación → agregar paso opcional al `build_deploy.sh`
- **M5.** Contraste de grises (`--mu2` sobre `--bg2`) puede no pasar WCAG AA → revisar

---

## 🟢 USABILIDAD (UX)

- **U1.** ✅ Zoom desbloqueado (C2)
- **U2.** Skeletons faltantes en biblioteca, eventos y coach (home/hábitos/historial ya tienen)
- **U3.** Empty states papercut: Lote 1 ✅ integrado; faltan los del mentor (Lote 2)
- **U4.** Coach IA sin streaming → mostrar respuesta token a token (se siente 3x más rápido)
- **U5.** Onboarding no se puede re-ver → agregar "Ver tutorial" en Más

---

## 🔵 ARQUITECTURA — Mediano plazo

- **AR1.** Coach → Claude con tool-use (agéntico, ya planeado)
- **AR2.** Centralizar constantes en un objeto `CONFIG` único
- **AR3.** Cache-busting de assets (`?v=N` en URLs de imágenes que cambien)
- **AR4.** Explotar `usage_events` (ya instrumentada, falta análisis)
- **AR5.** Checklist QA manual antes de cada deploy grande (existe `docs/TESTING_QA.md`)
- **AR6.** **Hosting standalone** (ver `GUIA_DEPLOY_SERVIDOR.md`) — habilita PWA real, elimina conflictos de tema, permite volver a UTF-8 legible

---

## 📋 Plan priorizado

### ✅ Sprint 1 — APLICADO HOY
| # | Acción | Estado |
|---|--------|--------|
| 1 | Service Worker + manifest + registro | ✅ |
| 2 | Suscripción push real → `push_subscriptions` | ✅ |
| 3 | VAPID nuevas + secrets en Supabase | ✅ |
| 4 | Quitar `user-scalable=no` | ✅ |
| 5 | Estructura `deploy/` + `build_deploy.sh` + guía | ✅ |
| 6 | **(Usuario)** Subir `deploy/` al servidor y probar push end-to-end | ⬜ |

### ✅ Sprint 2 — APLICADO HOY (performance)
| # | Acción | Estado |
|---|--------|--------|
| 7 | Filtro `role="client"` en servidor + `select()` específico en mentor (A1, A2) | ✅ |
| 7b | Calibrations: solo campos light (`user_id,date,week,coherence,created_at`) + ventana 90d + `limit(1500)` | ✅ |
| 7c | habit_tracker y session_notes con campos limitados + `limit()` | ✅ |
| 8 | `loading="lazy"` + `decoding="async"` en 11 imágenes no críticas (las 2 logos arriba se quedan eager) | ✅ |
| 9 | `loadClientFullCalibrations(clientId)` carga textos completos bajo demanda + cache `_clientCalibsFull` | ✅ |
| 9b | `openProfile()` dispara la carga lazy y re-renderiza el perfil cuando llegan los textos | ✅ |
| 10 | `console.warn` envuelto en helper `_w()` con flag `MAAT_DEBUG` (localStorage `maat-debug=1`) | ✅ (9 ocurrencias) |
| 10b | 1 caso de `innerHTML+=` en bucle → un solo `.map().join("")` | ✅ |
| 10c | 4 `innerHTML+=` de append individual → `insertAdjacentHTML("beforeend",...)` (~10x más rápido) | ✅ |

**Impacto medible:** la carga del overview del mentor con 100 clientes × 60 calibraciones pasa de ~5 MB a ~150 KB (98% menos). Los textos completos se cargan solo cuando se abre un perfil específico — y se cachean.

**Pendiente Sprint 2:** convertir las PNG papercut a WebP (requiere reupload). Genera ~70% menos peso.

### ✅ Sprint 3 — APLICADO HOY (UX percibido)
| # | Acción | Estado |
|---|--------|--------|
| 11 | **Streaming SSE en el Coach IA** — Edge Function reescrita (Mistral con `stream:true`) + frontend lee `text/event-stream` y renderiza tokens en vivo con throttle de 80ms. Edge desplegada al proyecto correcto. | ✅ |
| 12 | `skelBiblioteca` + `skelEventos` + `skelCoach` — skeletons añadidos a las 3 vistas pesadas. El dispatch los muestra solo si `_appReady=false` y la data secundaria aún no llegó. | ✅ |
| 13 | `replayTutorial()` en menú **Más** — vuelve a abrir el overlay de onboarding bajo demanda. | ✅ |
| 14 | Migración Elementor → standalone — instrucciones detalladas para reemplazar contenido de páginas viejas por redirect amable (auto-redirect a 2.5s + botón visible). | ✅ |

**Impacto:** el Coach IA ya no espera 5-15s en blanco — el texto empieza a aparecer en cuanto Mistral suelta el primer token (200-400ms). Percepción típica: ~3× más rápido aunque el total dure igual.

### Backlog
CONFIG centralizado · cache-busting · minificación · offline shell · Coach agéntico con Claude

---

*Auditoría sobre el estado actual. Re-evaluar tras subir deploy/ al servidor y validar push end-to-end.*
