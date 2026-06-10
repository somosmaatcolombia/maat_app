# MAAT — Índice de Producción Gráfica

> Lista completa de imágenes para el ecosistema MAAT (app cliente + portal mentor + landing + emails). Producción en estilo **papercut** con paleta MAAT.

---

## 🎨 Principios generales (leer antes de producir)

- **Estilo:** papercut artesanal (papel recortado por capas), consistente con las imágenes ya producidas
- **Paleta:** Celeste `#39A1C9` · Naranja `#EBA055` · Verde `#7DCD93` · Morado `#89608E` · Rojo `#D76B6E`
- **Fondos:** cream paper `#fdfaf6` o transparente según contexto
- **Exportar a 2x** (los tamaños listados ya son 2x para retina móvil)
- **Peso máximo:** 150 KB por imagen (WebP preferido, PNG aceptable)
- **Naming:** kebab-case, descriptivo, en español (ej: `onboarding-01-bienvenida.png`)

---

## 📂 Estructura de carpetas

```
recursos_graficos/
├── 00-marca/                  ← Logo, favicon (PRODUCIDAS ✅)
├── 01-fases/                  ← 4 fases del proceso (PRODUCIDAS ✅)
├── 02-landing/                ← Imágenes para la landing (PRODUCIDAS ✅)
├── 03-onboarding/             ← 4 pasos del onboarding (POR PRODUCIR 🔴)
├── 04-estados-vacios/         ← Empty states (POR PRODUCIR 🔴)
├── 05-celebraciones/          ← Logros y graduación (POR PRODUCIR 🟡)
├── 06-headers-secciones/      ← Banners de secciones (POR PRODUCIR 🟡)
├── 07-avatares-iconos/        ← Avatares y coach (POR PRODUCIR 🟢)
├── 08-backgrounds/            ← Fondos decorativos (POR PRODUCIR 🟢)
└── 09-meditaciones-portadas/  ← Portadas (se suben desde portal mentor)
```

**Prioridad:**
- 🔴 LOTE 1 — Crítico, mayor impacto inmediato (12 imágenes)
- 🟡 LOTE 2 — Importante para polish (14 imágenes)
- 🟢 LOTE 3 — Nice to have (8 imágenes)

---

## 🟢 LOTE 0 — YA PRODUCIDAS (referencia)

### 00-marca/
| Archivo | Tamaño | Uso |
|---------|--------|-----|
| `maat-logo-color.png` | 200×200 | Logo principal (hero landing, header dashboard) |
| `maat-logo-blanco.png` | 200×200 | Logo blanco para fondos oscuros (footer, mentor) |

### 01-fases/
| Archivo | Tamaño | Fase | Color dominante |
|---------|--------|------|-----------------|
| `fase-1-gratitud.png` | 600×600 | Gratitud (Semanas 1-4) | Celeste `#39A1C9` |
| `fase-2-amor.png` | 600×600 | Amor (Semanas 5-8) | Naranja `#EBA055` |
| `fase-3-intencion.png` | 600×600 | Intención (Semanas 9-12) | Verde `#7DCD93` |
| `fase-4-voluntad.png` | 600×600 | Voluntad (Semanas 13-16) | Morado `#89608E` |

### 02-landing/
| Archivo | Tamaño | Dónde aparece |
|---------|--------|---------------|
| `hero-papercut.png` | 1600×1000 | Hero full-bleed de landing |
| `carta-silueta-interior.jpeg` | 800×800 | Cierre de la carta (figura morada dentro de cabeza) |
| `grupo-comunidad.jpeg` | 800×800 | Sección "Cómo trabajamos" (círculo de personas) |
| `banner-proceso-interior.jpeg` | 1000×1000 | Banner pre-formulario (cabeza con personas dentro) |
| `registrate-aqui.png` | 600×200 | Decorador manuscrito en formulario |
| `ruben-perfil.png` | 400×400 | Foto de Rubén en firma de carta |

---

## 🔴 LOTE 1 — CRÍTICO (producir primero) — 12 imágenes

### 03-onboarding/ (4 imágenes)

Las pantallas de bienvenida en la app cliente. Hoy muestran emojis 🧭 ⚡ ✅ 🤖.

| Archivo | Tamaño | Color dominante | Tema visual |
|---------|--------|-----------------|-------------|
| `onboarding-01-bienvenida.png` | 800×800 | Celeste | Bienvenida / brújula / camino / amanecer |
| `onboarding-02-calibracion.png` | 800×800 | Celeste | Sol naciente / balanza / 30s / instante |
| `onboarding-03-habitos.png` | 800×800 | Verde | Semilla creciendo / ladrillos / escalera |
| `onboarding-04-coach.png` | 800×800 | Morado | Dos figuras / faro / acompañamiento |

- **Formato:** PNG con fondo transparente o cream paper
- **Display:** 280-320px de ancho en pantalla, centrada arriba del título

### 04-estados-vacios/ (5 imágenes principales)

Aparecen cuando no hay datos. Hoy muestran texto seco.

| Archivo | Tamaño | Dónde | Tema |
|---------|--------|-------|------|
| `empty-meditaciones.png` | 500×500 | Cliente: Biblioteca de meditaciones vacía | Persona meditando / ondas |
| `empty-eventos.png` | 500×500 | Cliente: Sin eventos próximos | Calendario / círculo de personas |
| `empty-creencias.png` | 500×500 | Cliente: Sin creencias registradas | Mente / pensamiento / nube |
| `empty-historial.png` | 500×500 | Cliente: Sin calibraciones aún | Diario / hoja / semilla |
| `empty-habitos.png` | 500×500 | Cliente: Sin hábitos en la semana | Mosaico de cuadrados vacíos / hilo |

- **Formato:** PNG **transparente** (van sobre fondo de la app, oscuro o claro)
- **Display:** ~180px centrada

### 05-celebraciones/ (3 imágenes críticas)

Momentos cumbre del usuario.

| Archivo | Tamaño | Cuándo aparece |
|---------|--------|----------------|
| `celebracion-graduacion.png` | 800×800 | Al completar las 16 semanas (graduación) |
| `celebracion-primera-calib.png` | 500×500 | Al hacer la primera calibración |
| `celebracion-fase-completa.png` | 500×500 | Al completar cada fase (4 hitos) |

- **Formato:** PNG transparente
- **Display:** centrado en overlay de celebración

---

## 🟡 LOTE 2 — IMPORTANTE (polish del ecosistema) — 14 imágenes

### 04-estados-vacios/ (resto para portal mentor)

| Archivo | Tamaño | Dónde |
|---------|--------|-------|
| `empty-clientes.png` | 500×500 | Mentor: sin clientes asignados |
| `empty-alertas.png` | 500×500 | Mentor: todo en orden, sin alertas |
| `empty-sesiones.png` | 500×500 | Mentor: sin notas de sesión |
| `empty-graduados.png` | 500×500 | Mentor: aún sin graduados |

### 06-headers-secciones/ (banners decorativos arriba de secciones grandes)

| Archivo | Tamaño | Sección |
|---------|--------|---------|
| `header-coach.png` | 1000×300 | Chat con Coach IA |
| `header-meditaciones.png` | 1000×300 | Meditaciones Guiadas |
| `header-libro.png` | 1000×300 | El Libro MAAT |
| `header-creencias.png` | 1000×300 | Creencias |
| `header-statement.png` | 1000×300 | Mi Statement / Hipnosis |
| `header-daily-maat.png` | 1000×300 | Daily Maat (comunidad estoica) |
| `header-eventos.png` | 1000×300 | Eventos y Experiencias |

- **Formato:** WebP o PNG con fondo de color de la sección
- **Aspect ratio:** 10:3 (banner horizontal)

---

## 🟢 LOTE 3 — NICE TO HAVE — 8 imágenes

### 07-avatares-iconos/

| Archivo | Tamaño | Uso |
|---------|--------|-----|
| `coach-avatar.png` | 400×400 | Avatar del Coach IA en chat (1:1, circular) |
| `mentor-avatar-default.png` | 400×400 | Cuando el mentor no tiene foto |
| `cliente-avatar-default.png` | 400×400 | Cuando el cliente no tiene foto |

### 08-backgrounds/

| Archivo | Tamaño | Uso |
|---------|--------|-----|
| `bg-auth-cliente.png` | 1200×1600 | Fondo de pantalla de login del cliente |
| `bg-auth-mentor.png` | 1200×1600 | Fondo de pantalla de login del mentor |
| `bg-hero-decorativo.png` | 1600×600 | Banner sutil de cabecera del home |

### 09-meditaciones-portadas/

| Archivo | Tamaño | Uso |
|---------|--------|-----|
| `meditacion-default-cover.png` | 600×600 | Portada cuando una meditación no tiene imagen |

> Las portadas de cada meditación las suben los mentores desde el portal — esta es solo el default.

---

## 📋 Resumen ejecutivo de producción

| Lote | Cantidad | Prioridad | Esfuerzo estimado |
|------|----------|-----------|-------------------|
| **LOTE 1** | 12 imágenes | 🔴 Crítico | 2-3 días |
| **LOTE 2** | 14 imágenes | 🟡 Importante | 3-4 días |
| **LOTE 3** | 8 imágenes | 🟢 Polish | 2-3 días |
| **TOTAL** | **34 imágenes** | | **1-2 semanas** |

---

## 🚀 Flujo de trabajo recomendado

1. **Diseñador produce las imágenes** en estilo papercut respetando paleta y naming
2. **Las guarda directamente en su carpeta correspondiente** (`recursos_graficos/03-onboarding/onboarding-01-bienvenida.png`)
3. **Sube a WordPress Media** (`somosmaat.org/wp-content/uploads/...`)
4. **Me pasa las URLs públicas** o sólo confirma que están subidas con esos nombres
5. **Yo las integro** en el código (HTML del cliente, mentor y landing)
6. **Commit + deploy**

---

## ✅ Para entregar al diseñador

Comparte con tu diseñador:
- Este documento (`INDICE_PRODUCCION.md`)
- La guía completa de estilo (`docs/GUIA_IMAGENES_PAPERCUT.md`)
- Las imágenes ya producidas como referencia visual del estilo

---

*Documento de producción. Actualizar a medida que se integren las imágenes.*
