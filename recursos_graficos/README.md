# 🎨 recursos_graficos/

Carpeta central de assets gráficos del ecosistema MAAT (app cliente + portal mentor + landing + emails).

---

## 📂 Organización

| Carpeta | Contenido | Estado |
|---------|-----------|--------|
| `00-marca/` | Logo y favicon | ✅ Producido |
| `01-fases/` | 4 fases del proceso | ✅ Producido |
| `02-landing/` | Imágenes de la landing | ✅ Producido |
| `03-onboarding/` | 4 pantallas de bienvenida | 🔴 LOTE 1 |
| `04-estados-vacios/` | Empty states (cliente y mentor) | 🔴 LOTE 1 / 🟡 LOTE 2 |
| `05-celebraciones/` | Graduación y logros | 🔴 LOTE 1 |
| `06-headers-secciones/` | Banners de secciones | 🟡 LOTE 2 |
| `07-avatares-iconos/` | Avatares default | 🟢 LOTE 3 |
| `08-backgrounds/` | Fondos decorativos | 🟢 LOTE 3 |
| `09-meditaciones-portadas/` | Default cover | 🟢 LOTE 3 |

---

## 📄 Documentos clave

- **`INDICE_PRODUCCION.md`** — Lista completa de imágenes con specs, tamaños y prioridades (compártelo con tu diseñador)
- **`../docs/GUIA_IMAGENES_PAPERCUT.md`** — Guía de estilo y principios técnicos
- Cada subcarpeta tiene su propio `README.md` con detalles específicos

---

## 🚀 Flujo de trabajo

1. **Diseñador** produce las imágenes en estilo papercut con paleta MAAT
2. **Las guarda en su subcarpeta** correspondiente (ej: `03-onboarding/onboarding-01-bienvenida.png`)
3. **Sube a WordPress Media** (`somosmaat.org/wp-content/uploads/...`)
4. **Te avisa con las URLs públicas** (o solo confirma con los nombres exactos)
5. **Claude las integra** en el código HTML correspondiente
6. **Commit + deploy**

---

## 🎯 Prioridad de producción

**LOTE 1 (12 imágenes — máximo impacto inmediato):**
- 4 onboarding (bienvenida, calibración, hábitos, coach)
- 5 empty states del cliente (meditaciones, eventos, creencias, historial, hábitos)
- 3 celebraciones (graduación, primera calibración, fase completa)

**LOTE 2 (14 imágenes — polish):**
- 4 empty states del mentor
- 7 headers de secciones
- Resto de celebraciones

**LOTE 3 (8 imágenes — polish final):**
- 3 avatares default
- 3 backgrounds
- Default de meditación

---

## 🎨 Recordatorio de paleta MAAT

```
Celeste (Fase 1 — Gratitud)    #39A1C9
Naranja (Fase 2 — Amor)        #EBA055
Verde   (Fase 3 — Intención)   #7DCD93
Morado  (Fase 4 — Voluntad)    #89608E
Rojo    (acentos / alertas)    #D76B6E
Cream paper (fondo principal)  #fdfaf6
Cream warm (variante cálida)   #f5efe6
Ink dark (texto)               #2a2030
```
