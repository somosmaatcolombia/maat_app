# MAAT — Plan de Acción Maestro

> Hoja de ruta que conecta el producto (ya construido) con el objetivo: **llegar a una ronda de inversión con tracción real + un piloto B2B validado.**

---

## El Norte

> Pasar de *"app de bienestar con ~10 usuarios y uso en declive"* a *"plataforma B2B de desarrollo de líderes con tracción medible y revenue"*. Esa transición es la que multiplica la valuación.

**3 palancas, en orden:**
1. **Tracción** (que la curva de uso suba — ya atacamos esto con Fase 1 y 2)
2. **Caso de estudio B2B** (una empresa que pague y dé resultados)
3. **Ronda** (con datos, no con promesas)

---

## HORIZONTE 1 — Esta semana (cerrar lo construido)

| # | Acción | Estado |
|---|--------|--------|
| 1 | Ejecutar `sql/maat_traction_metrics.sql` en Supabase | ⬜ Pendiente |
| 2 | Ejecutar `sql/maat_community_pulse.sql` | ✅ Hecho |
| 3 | Pegar app cliente actualizada en Elementor | ⬜ |
| 4 | Pegar portal del mentor (con dashboard Tracción) en Elementor | ⬜ |
| 5 | Commit + push de todo el trabajo nuevo | ⬜ |
| 6 | Verificar el dashboard de Tracción (ADMIN → Tracción) | ⬜ |

### Frente humano (NO requiere código — es lo más urgente)
| # | Acción | Por qué |
|---|--------|---------|
| 7 | **Rescatar a valery** (nueva, calibró solo el día 1) | Re-activación en vivo, recuperable hoy |
| 8 | **Entrevistar a Sebas** (power user que cayó en sem 8) | Entender el "valle de la muerte" = oro |
| 9 | **Entrevistar a 1 que nunca activó** (winston/rcarmona) | Por qué no arrancan = arreglar activación |

> Las entrevistas usan `docs/GUIA_ENTREVISTAS_FASE0.md`. Son el complemento cualitativo que los datos no dan.

---

## HORIZONTE 2 — Próximas 2-4 semanas (medir y validar)

| # | Acción | Resultado esperado |
|---|--------|--------------------|
| 1 | Dejar correr la app con Fase 1+2 desplegadas | Acumular datos en `usage_events` |
| 2 | Revisar el dashboard de Tracción semanalmente | Ver si la **Constancia** (métrica norte) sube |
| 3 | Comparar antes/después de las mejoras | Demostrar impacto con datos |
| 4 | Iterar sobre lo que digan las entrevistas | Ajustar fricciones reales |
| 5 | Producir el **Lote 1 de imágenes papercut** | App más cálida (8 imágenes) |

**Pregunta clave a responder:** ¿La curva de usuarios activos dejó de caer y empezó a subir? Si sí → tienes la prueba para el siguiente paso.

---

## HORIZONTE 3 — 1-3 meses (B2B + monetización)

| # | Acción | Por qué |
|---|--------|---------|
| 1 | Identificar 3-5 empresas de tu red para piloto | El primer "sí" sale de la red |
| 2 | Construir MVP del **dashboard de RRHH** (reutiliza el de Tracción) | Entregable de valor B2B |
| 3 | Crear `organizations` + `org_id` en profiles | Agrupar empleados por empresa |
| 4 | Empaquetar el **one-pager de oferta de piloto** | Material de venta |
| 5 | Cerrar **1 piloto B2B** (aunque sea con descuento fuerte) | El caso de estudio |
| 6 | Definir el **modelo de monetización** (suscripción/programa) | Ingresos recurrentes |

> Detalle completo en `docs/PILOTO_B2B.md`.

---

## HORIZONTE 4 — La ronda de inversión

Antes de levantar, tener listo:

| Activo | Fuente |
|--------|--------|
| **Tracción demostrable** | Dashboard de Tracción (curva creciente) |
| **Caso de estudio B2B** | Resultados del piloto |
| **Modelo de ingresos** | MRR aunque sea pequeño |
| **Métricas de retención** | `usage_events` + cohortes |
| **Benchmark de mercado** | `docs/PLAN_MEJORA_PSICOSOCIAL.md` + comps (BetterUp, Stoic, Waking Up) |
| **Deck / one-pager** | Por construir cuando haya datos |
| **IP / metodología** | Las 4 fases, proceso de 16 semanas |

> **No levantar antes de tener tracción + el piloto.** Sería muy dilutivo. Con estos activos, la conversación cambia de liga.

---

## Tablero de seguimiento (revisar mensual)

| Métrica | Hoy (línea base) | Meta 90 días |
|---------|------------------|--------------|
| Constancia (norte: 4+ cal/sem) | _medir en dashboard_ | +30% |
| Activación (calibran en 7d) | _medir_ | > 70% |
| Usuarios activos semanales (WAU) | ~2-4 | crecer sostenido |
| Empresas en pipeline B2B | 0 | 3-5 |
| Pilotos B2B cerrados | 0 | 1 |
| MRR | $0 | primer ingreso recurrente |

---

## Resumen de TODO lo que ya está construido (activos)

- ✅ App cliente (PWA) + Portal del mentor — funcionales en producción
- ✅ Coach IA (Mistral) con prompt afinado y renderizado de markdown
- ✅ Calibración Express, notificaciones cálidas, onboarding de activación
- ✅ Mapa de Progreso, cierre Peak-End, logros, capa social
- ✅ Sistema de graduados, meditaciones, eventos
- ✅ Instrumentación `usage_events` + Dashboard de Tracción
- ✅ Diagnóstico psicosocial + plan de mejora + guías
- ✅ Estructura de piloto B2B

> El producto está. Lo que falta no es código: es **tracción, un piloto y datos**. Ese es el foco ahora.

---

## El siguiente paso, hoy

1. Ejecuta el SQL de métricas
2. Pega ambas apps
3. **Escríbele a valery y agenda la entrevista con Sebas**

*Documento vivo. Actualizar a medida que avancen los horizontes.*
