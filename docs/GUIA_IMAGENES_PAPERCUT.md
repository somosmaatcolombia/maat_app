# MAAT — Guía de Producción de Imágenes (estilo Papercut)

> Especificación de dónde van las imágenes, qué tamaño y formato, para que se produzcan alineadas con la línea gráfica del proyecto. Estilo: **papercut** (arte de papel recortado por capas).

---

## Principios (leer antes de producir)

1. **Doble tema (claro/oscuro).** La app cambia entre fondo oscuro (`#0d1117`) y claro (`#f0f4f8`). Por eso:
   - **Escenas grandes** → van dentro de un contenedor con su propio fondo (banner/tarjeta). Pueden traer su "papel" de fondo. El tema de la app no las afecta.
   - **Iconos / spots pequeños** → PNG con **fondo transparente**, con elementos que se lean bien sobre claro y oscuro (evitar detalles muy claros o muy oscuros en los bordes).
2. **Peso.** Acabamos de optimizar la carga. Cada imagen debe pesar **< 150 KB**. Formato preferido **WebP**; si no, PNG optimizado (TinyPNG).
3. **Resolución 2x (retina).** La app es móvil. Exportar al **doble** del tamaño de visualización para que se vea nítida.
4. **Color.** Usar SIEMPRE la paleta MAAT (abajo). Cada fase tiene su color.
5. **Lazy-load.** Yo agrego `loading="lazy"` en el código para que no frenen la carga inicial.

---

## Paleta MAAT (para mantener coherencia)

```
Celeste (Fase 1 - Gratitud)    #39A1C9
Naranja (Fase 2 - Amor)        #EBA055
Verde   (Fase 3 - Intencion)   #7DCD93
Morado  (Fase 4 - Voluntad)    #89608E
Rojo (acentos/alertas)         #D76B6E

Fondo oscuro   #0d1117   Fondo claro   #f0f4f8
Texto claro    #e8eaf0   Texto oscuro  #1a2030
```

---

## Las imágenes — por prioridad

### LOTE 1 — Máximo impacto (producir primero)

#### 1. Onboarding (4 ilustraciones)
La primera impresión. Una escena papercut por paso.

| # | Paso | Tema visual sugerido | Color dominante |
|---|------|----------------------|-----------------|
| 1 | Bienvenida | Brújula / camino / amanecer | Celeste `#39A1C9` |
| 2 | Calibración (30s) | Sol naciente / balanza / respiración | Celeste `#39A1C9` |
| 3 | Hábitos | Semilla creciendo / ladrillos / escalera | Verde `#7DCD93` |
| 4 | Coach IA | Dos figuras acompañándose / faro | Morado `#89608E` |

- **Tamaño de exportación:** `800 × 800 px` (cuadrado 1:1)
- **Formato:** PNG transparente o WebP
- **Se ve a:** ~280–320 px de ancho, centrada arriba del título
- **Nota:** pueden traer fondo de "papel" suave porque van centradas en pantalla completa; si lo traen, que sea neutro (crema/gris muy claro) y lo enmarco con bordes redondeados.

#### 2. Cabeceras de las 4 fases (4 banners)
Aparecen en el home según la fase del usuario. Le dan identidad a cada etapa.

| Fase | Escena sugerida | Color |
|------|-----------------|-------|
| 1 — Gratitud | Amanecer, montañas, raíces | `#39A1C9` |
| 2 — Amor | Corazón de capas, flores, manos | `#EBA055` |
| 3 — Intención | Flecha, brújula, sendero | `#7DCD93` |
| 4 — Voluntad | Cumbre, llama, figura firme | `#89608E` |

- **Tamaño de exportación:** `1000 × 400 px` (relación 2.5:1, banner horizontal)
- **Formato:** WebP o PNG
- **Se ve a:** ancho completo de la tarjeta, ~120–160 px de alto
- **Nota:** traen fondo propio (van en banner con bordes redondeados). El fondo puede ser un degradado suave del color de la fase.

---

### LOTE 2 — Calidez y descubrimiento

#### 3. Estados vacíos (3–4 spots)
Cuando no hay contenido, en vez de texto seco, una ilustración amable.

| Pantalla | Escena sugerida |
|----------|-----------------|
| Sin meditaciones | Persona meditando / ondas de sonido |
| Sin eventos | Calendario / círculo de personas |
| Sin creencias aún | Mente / pensamiento / nube |
| Sin calibraciones (historial) | Diario / semilla |

- **Tamaño de exportación:** `500 × 500 px` (cuadrado)
- **Formato:** PNG **transparente** (van sobre el fondo de la app)
- **Se ve a:** ~160–200 px, centrada
- **Nota:** al ser transparentes, evitar bordes en colores extremos (que funcionen en claro y oscuro).

#### 4. Cabeceras de sección (opcional, 3 banners)
Banner delgado arriba de secciones grandes.

| Sección | Escena |
|---------|--------|
| Meditaciones Guiadas | Ondas / persona en calma |
| Eventos | Comunidad / encuentro |
| El Libro MAAT | Libro abierto de papel |

- **Tamaño de exportación:** `1000 × 300 px` (relación 3.3:1)
- **Formato:** WebP/PNG con fondo propio

---

### LOTE 3 — Momentos especiales (alto valor emocional)

#### 5. Celebración de graduación
Aparece cuando alguien completa las 16 semanas. Momento cumbre (Peak-End).

- **Escena:** cumbre alcanzada / sol pleno / figura con brazos arriba / laureles
- **Tamaño:** `800 × 800 px`
- **Color:** degradado naranja→morado (`#EBA055` → `#89608E`)
- **Formato:** PNG transparente o WebP

#### 6. Micro-logros / insignias (opcional, set de 4–6)
Insignias papercut para hitos (primera semana, cruzar a Fase 2, racha de 7 días…).

- **Tamaño:** `300 × 300 px` cada una
- **Formato:** PNG transparente

---

### YA SOPORTADAS (solo subir, sin código nuevo)

#### 7. Portadas de meditaciones
El código YA muestra `cover_url`. Se suben desde el portal del mentor.
- **Tamaño:** `600 × 600 px` (cuadrado 1:1)
- **Formato:** WebP/JPG < 120 KB

#### 8. Portadas de eventos
El código YA muestra `cover_url`.
- **Tamaño:** `1000 × 560 px` (relación 16:9)
- **Formato:** WebP/JPG < 120 KB

---

## Tabla resumen de tamaños

| Uso | Exportar a | Relación | Fondo | Formato |
|-----|-----------|----------|-------|---------|
| Onboarding | 800×800 | 1:1 | propio o transp. | PNG/WebP |
| Cabecera de fase | 1000×400 | 2.5:1 | propio (degradado) | WebP/PNG |
| Estado vacío | 500×500 | 1:1 | **transparente** | PNG |
| Cabecera de sección | 1000×300 | 3.3:1 | propio | WebP/PNG |
| Graduación | 800×800 | 1:1 | transp. o propio | PNG/WebP |
| Insignia | 300×300 | 1:1 | **transparente** | PNG |
| Portada meditación | 600×600 | 1:1 | propio | WebP/JPG |
| Portada evento | 1000×560 | 16:9 | propio | WebP/JPG |

---

## Flujo de trabajo

1. Produces las imágenes del **Lote 1** (8 imágenes: 4 onboarding + 4 fases) en estilo papercut con la paleta.
2. Las subes a **WordPress → Media → Añadir nuevo**.
3. Me pasas las URLs (o las nombras consistente, ej: `maat-onboarding-1.webp`, `maat-fase-1.webp`).
4. Yo agrego los `<img>` en el código con lazy-load, tamaños correctos y enmarcado adecuado para cada tema.
5. Repetimos con Lote 2 y 3.

---

## Recomendación de orden

**Empieza por el Lote 1.** Las 4 del onboarding + las 4 de fase son las de mayor impacto visible y emocional, y son una cantidad manejable para producir en estilo papercut consistente. Con esas 8 la app ya se sentirá mucho más cálida y "tuya".

*Documento de producción. Ajustar tamaños si cambia el diseño.*
