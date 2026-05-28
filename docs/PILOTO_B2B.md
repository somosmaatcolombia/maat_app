# MAAT — Estructuración del Piloto B2B

> Cómo llevar MAAT de B2C (personas sueltas) a B2B (empresas que pagan por el bienestar y desempeño de sus líderes). Este es el camino que más multiplica la valuación — el modelo de BetterUp ($4.7B en su pico).

---

## 1. Por qué B2B (la tesis)

- **B2C de bienestar tiene churn brutal** y CAC alto. Vender uno a uno es agotador.
- **Las empresas SÍ pagan** por: retención de talento, burnout, productividad, liderazgo.
- MAAT ataca exactamente el dolor de las empresas: **profesionales de alto rendimiento que perdieron sentido y energía** (= burnout silencioso, fuga de talento, líderes en automático).
- Un solo contrato B2B = ingresos de decenas de usuarios B2C, con menor churn y venta más estable.

---

## 2. Propuesta de valor para la empresa

| Dolor de la empresa | Lo que MAAT entrega |
|---------------------|---------------------|
| Burnout y desmotivación de líderes | Proceso estructurado de 16 semanas que reconecta con propósito |
| Fuga de talento clave | Inversión visible en el bienestar del equipo → retención |
| Falta de visibilidad del estado del equipo | Dashboard agregado de coherencia/actitud (sin exponer individuos) |
| Programas de bienestar que nadie usa | Acompañamiento diario + Coach IA + mentor humano |
| Capacitaciones que no dejan huella | Metodología con seguimiento y métricas reales |

**Pitch en una frase:**
> *"MAAT es el sistema operativo interior de tus líderes: 16 semanas de neurociencia aplicada, acompañamiento diario y un coach con IA, para que tu mejor talento recupere energía, foco y propósito — con métricas que tú puedes ver."*

---

## 3. El producto B2B (qué cambia vs. el B2C actual)

La base ya está construida. Para B2B se agrega:

| Componente | Estado | Nota |
|------------|--------|------|
| App del cliente (empleado) | ✅ Existe | Sin cambios — cada líder la usa igual |
| Portal del mentor | ✅ Existe | El mentor MAAT acompaña a la cohorte |
| **Dashboard de RRHH (empresa)** | 🔨 Por construir | Métricas **agregadas y anónimas** del equipo |
| **Concepto de "Organización/Cohorte"** | 🔨 Por construir | Agrupar empleados de una empresa |
| Reportes ejecutivos | 🔨 Por construir | PDF/vista mensual para el sponsor |

### Privacidad — el punto MÁS crítico del B2B
> Los empleados **deben confiar** en que su jefe NO ve sus respuestas individuales. Si sienten vigilancia, no lo usan (ya vimos esa fricción en el diagnóstico).
- RRHH ve **SOLO datos agregados** de la cohorte (ej: "coherencia promedio del equipo: 64%", "78% activos esta semana"). **Nunca** respuestas, calibraciones o nombres individuales.
- Mínimo de la cohorte para mostrar datos: **5+ personas** (para que nadie sea identificable).
- Esto se comunica explícitamente al empleado en el onboarding. Es un diferenciador, no una limitación.

---

## 4. Estructura del piloto

### Formato recomendado
| Variable | Recomendación |
|----------|---------------|
| **Duración** | 16 semanas (1 ciclo completo) o piloto corto de 8 semanas |
| **Participantes** | 8–15 líderes de UNA empresa (cohorte) |
| **Precio piloto** | Descuento por ser early (ver §5) |
| **Acompañamiento** | 1 mentor MAAT + app + 2-3 sesiones grupales |
| **Sponsor interno** | Un líder de RRHH / People que crea en el proyecto |
| **Cierre** | Reporte de impacto + propuesta de renovación/expansión |

### Fases del piloto
1. **Kickoff (semana 0):** sesión grupal de bienvenida, explicar privacidad, activar cuentas
2. **Semanas 1-4 (Gratitud):** acompañamiento diario, primera sesión grupal
3. **Semanas 5-12:** seguimiento, sesión grupal a mitad de camino (el "valle")
4. **Semanas 13-16:** integración, ceremonia de graduación
5. **Cierre:** reporte ejecutivo + reunión con el sponsor + oferta de expansión

---

## 5. Modelo de precios (referencia LatAm)

> Ajustar según mercado. Cobrar **por empleado por mes** (PEPM) o por programa.

| Modelo | Rango referencia | Nota |
|--------|------------------|------|
| **Por programa de 16 sem / persona** | $150 – $400 USD | Más fácil de vender como "capacitación" |
| **Suscripción PEPM** | $15 – $40 USD/mes | Modelo recurrente (mejor para valuación) |
| **Piloto early (descuento)** | 40-60% off | A cambio de testimonio + caso de estudio |

**Ejemplo de piloto:** 10 líderes × 16 semanas × $200 = **$2.000 USD** (o con descuento early, ~$1.000–$1.200). El valor real no es ese ticket — es el **caso de estudio** que abre la puerta a contratos grandes y a la ronda de inversión.

---

## 6. Qué construir en el producto (priorizado)

| # | Feature | Esfuerzo | Por qué |
|---|---------|----------|---------|
| 1 | **Tabla `organizations` + `org_id` en profiles** | Bajo | Agrupar empleados por empresa |
| 2 | **Dashboard RRHH agregado** (función SECURITY DEFINER que filtra por org y exige cohorte ≥5) | Medio | El entregable de valor para la empresa |
| 3 | **Onboarding con mensaje de privacidad** | Bajo | Generar confianza del empleado |
| 4 | **Reporte ejecutivo mensual** (vista/PDF) | Medio | Para el sponsor; cierra renovaciones |
| 5 | Invitaciones por lote (RRHH sube lista) | Medio | Onboarding sin fricción |

> El dashboard de tracción que acabamos de construir es la **base técnica** del dashboard de RRHH — se reutiliza filtrando por organización.

---

## 7. A quién venderle (perfil del primer cliente)

- **Tamaño:** empresas medianas (50-500 empleados) — suficientes líderes, decisiones ágiles.
- **Sectores ideales:** tecnología, consultoría, agencias, startups en crecimiento, servicios profesionales (donde el burnout de líderes es caro y visible).
- **Decisor:** Director/a de Gente y Cultura, Head of People, o un CEO consciente.
- **Puerta de entrada más fácil:** una empresa donde ya tengas relación/confianza. El primer piloto casi siempre sale de la red personal del fundador.

---

## 8. Métricas de éxito del piloto

| Métrica | Meta sugerida |
|---------|---------------|
| Activación (líderes que calibran en semana 1) | > 70% |
| Constancia (calibran 4+ días/semana) | > 40% |
| Finalización del programa | > 60% |
| Mejora de actitud promedio (inicio vs. fin) | +1.5 puntos |
| NPS de participantes | > 50 |
| Testimonios en video | ≥ 3 |
| Renovación / expansión del sponsor | Sí / No (la verdadera meta) |

> Con `usage_events` y las métricas que ya construimos, **todo esto es medible y demostrable**. Eso es exactamente lo que un inversionista quiere ver.

---

## 9. Cómo conecta con la inversión

Un piloto B2B exitoso te da, para la ronda:
1. **Validación de mercado** (alguien pagó)
2. **Modelo de ingresos** (recurrente y escalable)
3. **Caso de estudio** con métricas reales de impacto
4. **Pipeline** (otras empresas interesadas)

Esto mueve la conversación de *"app de bienestar con 10 usuarios"* a *"plataforma B2B de desarrollo de líderes con tracción y revenue"* — otra liga de valuación.

---

## 10. Próximos pasos concretos

1. **Esta semana:** identificar 3-5 empresas de tu red para un piloto.
2. **Construir:** el MVP del dashboard de RRHH (reutiliza el de tracción).
3. **Empaquetar:** un one-pager de la oferta de piloto.
4. **Vender:** conseguir el primer "sí" — aunque sea con fuerte descuento.
5. **Documentar:** convertir ese piloto en el caso de estudio para la ronda.

> Regla de oro: **el primer piloto no es por el dinero, es por la prueba.** Un caso de estudio con datos vale más que el ticket.

*Documento estratégico. Ajustar precios y metas según mercado real.*
