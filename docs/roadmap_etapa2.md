# MAAT — Roadmap Etapa 2: Entrenamientos en vivo + Ecosistema de Eventos

> Bosquejo de planeación para revisión. Objetivo: sumar (1) entrenamientos físicos
> semanales en vivo y (2) un calendario de actividades/eventos del ecosistema de
> bienestar, con distinción virtual/presencial y eventos incluidos o de pago.

## Idea unificadora

Un **entrenamiento es un tipo de evento**. En vez de dos sistemas separados,
construimos UN motor de **Eventos** que subsume ambos:

- Entrenamientos (recurrentes, incluidos, virtuales) → eventos categoría `entrenamiento`.
- Charlas / talleres / experiencias (sound healing, nutrición…) → eventos de otras categorías, incluidos o de pago, virtuales o presenciales.

La app muestra **un solo calendario** (semanal + mensual) que combina todo, con color
por modalidad. Reutilizamos lo que ya existe: `mentor_sessions` (mentoría privada) se
queda como está; los eventos son la capa **abierta del ecosistema**.

## Reutilizar lo que ya tienes (no reconstruir)

| Ya existe | Se reutiliza para |
|---|---|
| Agenda de sesiones + "próximas sesiones" en la app | Base del calendario y las tarjetas de "próximos eventos" |
| `session-reminders` (edge function push) | Recordatorios antes de cada evento inscrito |
| Portal del mentor (CRUD de grupos/sesiones) | Gestor de eventos y recurrencias |
| Push + `notification_templates` | Avisos de "empieza en 1h" / "en vivo ahora" |
| Columnas de pago/suspensión en `profiles` | Control de acceso a eventos de pago |
| Estilo papercut + banco de imágenes | Portada/medallón por categoría de evento |

---

## Modelo de datos (bosquejo)

**events** — cada actividad concreta con fecha/hora
- id, title, description, category (`entrenamiento`|`taller`|`charla`|`experiencia`)
- modality (`virtual`|`presencial`|`hibrido`), access (`incluido`|`pago`)
- price_cop (numeric, null si incluido), price_note
- starts_at (timestamptz), duration_min, timezone (default `America/Bogota`)
- join_url (virtual), location + location_url (presencial), city (para filtrar presenciales)
- capacity (int, null = ilimitado), host_name, host_id (fk profiles opc.)
- image (papercut), is_published, recurrence_id (fk, null si único), created_by, created_at

**event_recurrences** — plantilla de los entrenamientos semanales
- id, title, category, modality, access, day_of_week (0-6), time_local, duration_min,
  join_url, host_name, image, timezone, active
- Un cron materializa instancias en `events` unas 4 semanas hacia adelante.

**event_registrations** — inscripción del usuario
- id, event_id, user_id, status (`inscrito`|`asistio`|`cancelado`|`pago_pendiente`|`pagado`)
- unique(event_id, user_id), created_at

RLS: eventos publicados los leen los clientes activos; el usuario gestiona sus propias
inscripciones; mentor/admin gestionan eventos (patrón `is_mentor_or_admin`).

---

## Fases de ejecución

### Fase A — Motor de eventos + calendario (núcleo, sin pagos)
1. SQL: tablas `events`, `event_registrations` + RLS + índices.
2. Portal admin/mentor: crear/editar evento (categoría, modalidad, fecha, cupo, link, papercut, publicar).
3. App: vista **Calendario** (toggle semana/mes), color por modalidad, filtros por categoría.
4. App: **detalle de evento** (hora local, host, botón "Unirse" virtual / ubicación+mapa presencial) + inscribirse/cancelar con control de cupo.
5. Home: tarjetas "Próximo evento" y "Mis inscripciones".

### Fase B — Entrenamientos en vivo recurrentes
6. SQL: tabla `event_recurrences`.
7. Portal: definir entrenamientos recurrentes (día + hora + link + facilitador).
8. Cron: materializar instancias semanales (4 semanas adelante).
9. App: bloque destacado "Entrenamientos de la semana" con botón "Unirse" que se activa cerca de la hora.
10. Recordatorios push: "empieza en 1h" y "en vivo ahora" a inscritos.

### Fase C — Eventos de pago (por etapas)
- C1 (recomendado etapa 2): marcar precio + link de pago externo (transferencia/WhatsApp/link de cobro) + confirmación manual del admin → status `pagado` habilita el acceso.
- C2 (proyecto aparte): pasarela integrada para COP (Wompi / Bold / Mercado Pago) con webhook que confirma el pago y da acceso automático.

### Fase D — Pulido y ecosistema
- Grabaciones on-demand para quien no alcanzó el vivo (semilla de biblioteca de contenido).
- Filtro de presenciales por ciudad del usuario.
- Eventos públicos (no-clientes) como generador de leads → conecta con el funnel de Biotipo.

---

## Viabilidad (semáforo)

| Pieza | Viabilidad | Nota |
|---|---|---|
| Calendario semana/mes en la app | Verde | Vanilla JS, es el mayor trozo de front pero directo |
| CRUD de eventos en el portal | Verde | Calca el CRUD de grupos/sesiones existente |
| Inscripción + cupo | Verde | Tabla simple + RLS |
| Video en vivo | Verde (con link externo) | NO construir video propio: usar Zoom/Meet recurrente |
| Recurrencia + materializador | Verde | Cron como los que ya corren |
| Recordatorios push | Verde | Infra ya montada |
| Eventos incluidos | Verde | Sin fricción |
| Eventos de pago (link+manual) | Amarillo | Operativo, requiere disciplina de confirmación |
| Pasarela integrada COP | Rojo/aparte | Proyecto propio (webhook, reembolsos, contabilidad) |
| Zona horaria diáspora | Amarillo | Guardar timezone y mostrar hora local + base |

**Veredicto:** muy viable. Encaja en la arquitectura actual sin romper nada. El 80%
del valor (calendario + entrenamientos + eventos incluidos) es Verde. Lo único que
puede crecer sin control es **pagos** — por eso se aísla y se difiere.

---

## Reflexiones puntuales

1. **No construir video.** El trabajo de la app es mostrar el link correcto a la hora correcta y recordar. Un link recurrente de Zoom/Meet por entrenamiento baja la carga operativa.
2. **Pagos son el verdadero fork.** No dejes que bloqueen el lanzamiento del calendario. Etapa 2 = incluidos + pago por link/manual. Pasarela = después.
3. **Realidad operativa del vivo.** 4 entrenamientos/semana = 16/mes de tiempo de facilitador. Sugiero **arrancar con 2/semana**, validar asistencia real, y escalar. Graba y ofrece on-demand para los que faltan.
4. **Zona horaria.** Con diáspora, "8am" es distinto para cada quien. Mostrar hora local + etiqueta de la base (COL). Quizá un slot para América y otro para Europa/US.
5. **Presenciales son geográficamente limitados.** Etiquetar por ciudad y filtrar; si no, generan ruido a quien está lejos.
6. **El calendario es motor de retención Y de ingresos.** Talleres de pago (sound healing, nutrición) son revenue; eventos públicos son lead-gen que se enchufa al funnel de Biotipo.
7. **Papercuts:** cada categoría necesita su ilustración (entrenamiento, sound-healing, nutrición, charla, experiencia, taller). Buen momento para ampliar el banco — se usan en tarjetas del calendario, detalle y recordatorios.

---

## Decisiones para alinear antes de ejecutar

- ¿Eventos solo para clientes, o también públicos (lead-gen)?
- Plataforma de video: ¿Zoom, Google Meet o Jitsi? ¿Link fijo recurrente o por instancia?
- Pagos etapa 2: ¿link externo + confirmación manual (recomendado) o ya pasarela?
- ¿Arrancamos con 2 o 4 entrenamientos/semana?
- ¿Necesitamos ciudad en `profiles` para filtrar presenciales?
- Papercuts nuevos: ¿arte específico por categoría o genéricos que asigno yo?
