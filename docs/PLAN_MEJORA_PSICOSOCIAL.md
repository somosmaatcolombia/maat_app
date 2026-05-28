# MAAT — Plan de Mejora Psicosocial y de Usabilidad

> Objetivo: reducir la **resistencia al uso** de la app y convertirla en un espacio que las personas *quieran* habitar, no que sientan como una obligación más. Evaluado desde la psicología del comportamiento y la sociología del cambio.

---

## 0. El problema en una frase

> La app le pide a profesionales de alto rendimiento —saturados de tiempo, orientados a resultados y emocionalmente agotados— que hagan algo **lento, introspectivo, vulnerable y sin recompensa inmediata**, mientras saben que **un mentor los está observando**.

Eso genera tres fricciones simultáneas que hay que nombrar antes de "mejorar la UX":

1. **Fricción de esfuerzo** (psicológica): "es una tarea más en mi día saturado".
2. **Fricción de identidad** (psicosocial): "hacer esto significa admitir que estoy mal / soy vulnerable".
3. **Fricción de sentido** (sociológica): "no veo qué gano hoy, ni a quién le importa que lo haga".

Cualquier mejora que no ataque estas tres raíces será cosmética.

---

## 1. Diagnóstico — Medir la resistencia antes de tocar nada

No se puede mejorar lo que no se mide. **Fase 0 obligatoria.**

### 1.1 Métricas cuantitativas (instrumentar en la app + Supabase)

| Métrica | Qué revela | Cómo medirla |
|---|---|---|
| **Activación** | % que completa su 1ª calibración tras registrarse | `calibrations` vs `profiles.created_at` |
| **Retención D1/D7/D30** | Cuántos vuelven al día 1, 7, 30 | `calibrations.date` distintas por usuario |
| **Tasa de calibración diaria** | El hábito central: ¿calibran a diario? | calibraciones / días desde alta |
| **Curva de abandono por semana** | ¿En qué semana se caen? (¿semana 2-3?) | distribución de `current_week` vs activos |
| **Profundidad de uso** | ¿Usan solo calibración o también coach/meditación/hábitos? | conteo por tabla y por usuario |
| **Streak promedio y máximo** | Continuidad real | días consecutivos con calibración |
| **Latencia de respuesta al prompt** | Cuánto tardan en calibrar tras la notificación | hora notif vs hora calibración |
| **Tasa de uso del Coach IA** | ¿Conversan o lo ignoran? | `chat_messages` activos / total |

> **Acción técnica sugerida:** crear una tabla `usage_events (user_id, event, meta, created_at)` y loguear eventos clave (app_open, view_enter, calib_start, calib_done, coach_msg, meditation_play, habit_check). Es la base de TODO lo demás.

### 1.2 Métricas cualitativas (lo que los números no dicen)

- **Entrevistas 1:1** con 5-8 usuarios: 3 activos, 3 que abandonaron, 2 graduados. Pregunta clave: *"Cuéntame la última vez que NO quisiste abrir la app. ¿Qué pasó por tu cabeza?"*
- **Los 5 porqués** sobre cada abandono.
- **Journey map emocional**: dibujar el recorrido de las 16 semanas marcando picos de frustración y de satisfacción.
- **Test de usabilidad observado**: ver a alguien usar la app sin ayuda y anotar cada duda/pausa.

### 1.3 Entregable de la Fase 0
Un documento de 1 página: **"Las 3 fricciones reales de MAAT"** con datos que las respalden. Sin esto, lo demás es opinión.

---

## 2. Marco psicológico aplicado a MAAT

### 2.1 Modelo de Comportamiento de Fogg — `B = M·A·P`
Un comportamiento ocurre cuando coinciden **Motivación, Habilidad (facilidad) y un Prompt (disparador)**. Si falla uno, no hay conducta.

| Palanca | Diagnóstico en MAAT | Intervención |
|---|---|---|
| **Motivación (M)** | Abstracta y a largo plazo ("transformación") | Hacer visible el progreso HOY; recompensa emocional inmediata |
| **Habilidad (A)** | La calibración de 3 preguntas puede sentirse pesada en un día ocupado | "Modo express": calibración mínima de 30 segundos |
| **Prompt (P)** | Notificación genérica a hora fija | Disparador personalizado, contextual y cálido |

> **Principio rector:** primero subir la **facilidad** (la palanca más barata), no la motivación. Es más fácil hacer la conducta trivial que motivar a alguien agotado.

### 2.2 Teoría de la Autodeterminación (Deci & Ryan)
La motivación intrínseca necesita 3 nutrientes:

- **Autonomía** — que el usuario sienta que elige, no que obedece. *Problema actual:* el mentor "vigila" → sensación de control externo. *Solución:* reencuadrar la calibración como "tu espejo", no "tu reporte".
- **Competencia** — sentir que progresa y es capaz. *Solución:* feedback de avance, micro-logros, lenguaje que celebre el intento, no solo el logro.
- **Relación (Relatedness)** — sentirse acompañado. *Problema actual:* es una experiencia solitaria hasta la graduación. *Solución:* capa social ligera desde el día 1 (ver punto 3).

### 2.3 Modelo Hook (Nir Eyal) — construir el hábito
`Disparador → Acción → Recompensa variable → Inversión`

- **Disparador:** externo (notif) al inicio → debe migrar a interno (sentir que "necesito mi momento de calibración").
- **Acción:** la más simple posible (calibración express).
- **Recompensa variable:** ¡clave que falta! Hoy la recompensa es predecible. Variar: a veces una frase del coach, a veces un insight sobre tu patrón, a veces reconocimiento, a veces un audio sorpresa.
- **Inversión:** cada calibración debe construir algo visible que el usuario no quiera perder (su historia, su racha, su "mapa de coherencia").

### 2.4 Reducir carga cognitiva (Sweller) + Peak-End Rule (Kahneman)
- La app tiene muchas secciones. **Riesgo de parálisis.** El home debe tener **UN solo siguiente paso obvio**, no un menú.
- La gente recuerda el **pico emocional** y el **final** de cada sesión. Diseñar deliberadamente un buen cierre de cada interacción (no terminar en un formulario seco, sino en una frase que resuene).

### 2.5 Vulnerabilidad y vergüenza (Brené Brown) — el bloqueo del alto rendimiento
Tu público se define por "tener todo bajo control". Pedirles introspección emocional activa **defensas**. Estrategias:
- Lenguaje que normalice: "los profesionales más exigentes son los que más necesitan este espacio".
- Marco de **fortaleza, no de terapia**: "esto es entrenamiento mental de élite", no "esto es para gente que está mal".
- Privacidad percibida: dejar claro qué ve el mentor y qué no.

---

## 3. Marco sociológico aplicado a MAAT

### 3.1 El proceso MAAT YA ES un rito de paso (Van Gennep / Victor Turner)
Las 4 fases mapean perfectamente las tres etapas de todo rito de iniciación:

| Etapa del rito | Fase MAAT | Significado |
|---|---|---|
| **Separación** | Fase 1 — Gratitud (Uncover) | Dejar atrás el "yo automático" |
| **Liminalidad** (umbral) | Fases 2-3 — Amor / Intención | El espacio incómodo de transformación |
| **Reincorporación** | Fase 4 — Voluntad (Integrate) → Graduación | Volver transformado, reconocido por la comunidad |

> **Insight estratégico:** explotar conscientemente este marco. La graduación no es "terminar un curso", es un **rito de paso reconocido socialmente**. Eso justifica ceremonia, símbolos, comunidad y estatus. Ya tienes el badge 🎓 y la comunidad de graduados — son el embrión correcto.

### 3.2 Pertenencia y efervescencia colectiva (Durkheim, Baumeister)
El cambio sostenido casi nunca es individual; es social. La gente persiste cuando **pertenece a un grupo que también lo hace**.
- **Cohortes:** agrupar usuarios que empiezan juntos ("Generación Mayo 2026"). Avanzar en grupo crea presión social positiva y compañía.
- **Rituales sincrónicos:** un momento semanal compartido (ej: "el domingo todos calibramos la semana") genera efervescencia colectiva.

### 3.3 Prueba social y normas (Cialdini)
- Mostrar (con tacto y anonimato) que "otros como tú lo están haciendo": *"82% de tu cohorte calibró hoy"*.
- Testimonios de graduados visibles en momentos de duda.

### 3.4 Identidad y estatus (Bourdieu, Goffman)
- El cambio se sostiene cuando se vuelve **identidad** ("soy alguien que se calibra"), no tarea.
- Símbolos de estatus: niveles, insignias de fase, el badge de graduado como capital simbólico dentro de la comunidad.

### 3.5 Lazos débiles y red (Granovetter)
- La comunidad de graduados no debe ser solo un repositorio de eventos: debe permitir conexión entre miembros (los "lazos débiles" son los que más oportunidades y sentido aportan).

---

## 4. Intervenciones concretas mapeadas a las features actuales

Priorizadas por impacto/esfuerzo. Cada una ataca una fricción nombrada en §0.

### 🔴 Alto impacto / bajo esfuerzo (hacer primero)

1. **Calibración Express (30s)** — ataca Fricción de Esfuerzo
   - Opción de calibrar solo con el slider de coherencia + 1 palabra, dejando las 3 preguntas como "modo profundo" opcional.
   - *Métrica:* tasa de calibración diaria ↑.

2. **Un solo "siguiente paso" en el home** — reduce carga cognitiva
   - El home abre con UNA acción destacada según el momento del día/proceso, no con un menú de 8 opciones.
   - *Métrica:* tiempo hasta primera acción ↓.

3. **Recompensa variable post-calibración** — construye el Hook
   - Al terminar de calibrar, mostrar algo distinto cada vez: un insight de su patrón, una frase del coach, reconocimiento de racha, un mini-audio.
   - *Métrica:* retención D7 ↑.

4. **Reencuadre de lenguaje (vulnerabilidad → fortaleza)** — ataca Fricción de Identidad
   - Auditar todos los textos. "Reporte/seguimiento" → "tu espejo". "Tarea" → "ritual/práctica". Celebrar el intento.
   - *Métrica:* cualitativa (entrevistas) + activación.

5. **Notificaciones cálidas y contextuales** — fortalece el Prompt (P de Fogg)
   - En vez de "Calibra tu día", usar mensajes variados, personales, a veces con el nombre, a veces con una pregunta. Respetar la hora que el usuario elige (autonomía).
   - *Métrica:* latencia notif→calibración ↓.

### 🟡 Alto impacto / esfuerzo medio

6. **Mapa de progreso visible y emocional** — Competencia (SDT) + Zeigarnik
   - Visualizar el viaje de 16 semanas como un camino/rito, con la fase actual destacada y lo recorrido celebrado. Que SIENTAN el avance.

7. **Sistema de micro-logros e identidad** — identidad + estatus
   - Insignias por hitos significativos (no triviales): "Primera semana completa", "Cruzaste el umbral (Fase 2)", "Maestro de la constancia". Lenguaje de identidad.

8. **Capa social ligera desde el día 1** — Relatedness + pertenencia
   - Aunque sea anónima al inicio: "X personas en tu cohorte calibraron hoy". Construir hacia cohortes reales.

9. **Cierre emocional de cada sesión (Peak-End)** — diseñar el final
   - Cada interacción termina en una frase que resuene, no en un formulario seco.

### 🟢 Estratégico / mayor esfuerzo

10. **Cohortes / generaciones** — efervescencia colectiva
    - Agrupar inicios, avanzar en grupo, rituales semanales compartidos.

11. **Ritualizar la graduación** — rito de paso completo
    - Ceremonia digital, certificado simbólico, bienvenida pública a la comunidad de graduados.

12. **Comunidad de graduados como red viva** — lazos débiles
    - No solo eventos: espacio de conexión, mentoría entre pares, testimonios.

---

## 5. KPIs — Sistema para "evaluar el avance"

> Esto responde directo a tu pedido: *cómo evaluar si las mejoras funcionan.*

### 5.1 Métrica Norte (la única que importa de verdad)
**Tasa de calibración semanal sostenida** = % de usuarios activos que calibran ≥4 días/semana.
Es el mejor proxy de "la app dejó de ser resistida y se volvió hábito".

### 5.2 Tablero de KPIs (revisar mensual)

| Dimensión | KPI | Línea base (medir hoy) | Meta 90 días |
|---|---|---|---|
| **Activación** | % completa 1ª calibración en 48h | _medir_ | +20% |
| **Retención** | Retención D30 | _medir_ | +25% |
| **Hábito** | Calibración semanal sostenida (Norte) | _medir_ | +30% |
| **Profundidad** | % que usa ≥3 features | _medir_ | +15% |
| **Avance** | % que llega a Fase 2 (cruza el umbral) | _medir_ | +20% |
| **Finalización** | % que completa las 16 semanas | _medir_ | +15% |
| **Comunidad** | % de graduados activos en comunidad | _medir_ | definir |
| **Cualitativo** | NPS / "¿recomendarías MAAT?" | _medir_ | >50 |

### 5.3 Cadencia de evaluación
- **Semanal:** revisar la Métrica Norte + abandono por semana.
- **Mensual:** tablero completo + 2 entrevistas cualitativas.
- **Por release:** A/B test de cada intervención grande (ej: home actual vs. home con "un solo paso").

---

## 6. Roadmap sugerido

| Fase | Duración | Foco | Entregable |
|---|---|---|---|
| **0 — Diagnóstico** | 2 semanas | Instrumentar `usage_events` + entrevistas | "Las 3 fricciones reales" con datos |
| **1 — Quick wins** | 3-4 semanas | Intervenciones 🔴 1-5 | Calibración express, home enfocado, lenguaje, notifs |
| **2 — Motivación profunda** | 4-6 semanas | Intervenciones 🟡 6-9 | Mapa de progreso, logros, capa social, cierres |
| **3 — Capa social** | 6-8 semanas | Intervenciones 🟢 10-12 | Cohortes, ritual de graduación, comunidad viva |
| **Continuo** | — | Medición y A/B | Tablero de KPIs vivo |

---

## 7. Principios de diseño MAAT (para no perder el norte)

1. **Facilidad antes que motivación** — siempre baja la fricción primero.
2. **Un solo siguiente paso** — nunca abrumar.
3. **Fortaleza, no terapia** — el marco es de élite, no de carencia.
4. **Espejo, no reporte** — el usuario es dueño de su data; el mentor acompaña, no vigila.
5. **El intento se celebra** — no solo el logro.
6. **Nunca solo** — el cambio es social.
7. **Cada sesión cierra bien** — diseñar el último segundo.
8. **Es un rito de paso** — hay umbral, transformación y reincorporación con estatus.

---

*Documento vivo. Actualizar tras la Fase 0 con los datos reales de fricción.*
