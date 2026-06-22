# MAAT — Estrategia de Notificaciones (Ritual diario + Ancla de coherencia)

> Objetivo: sostener el uso diario de la app con recordatorios **nobles y certeros**,
> sin caer en fatiga ni en culpa. Documento de estrategia (no implementado todavía).
>
> Decisiones tomadas: ancla de coherencia **adaptativa** · tope **máximo 2 push/día**.

---

## 1. Diagnóstico — qué hay hoy y por qué no alcanza

| Mecanismo actual | Qué hace | Limitación |
|---|---|---|
| **Notificaciones locales** (`scheduleNotifications`) | Recordatorio de calibración a 1 hora + cierre de semana los domingos | **Solo dispara con la app abierta** → inútil para quien la cerró |
| **Push del servidor** (`send-notifications`, cron horario) | Push real (funciona con app cerrada), re-engancha ausentes 2+ días, copy graduado | **Solo reactivo**: nada hasta que el usuario ya lleva días perdido |

**El hueco:** no existe un ritual diario *proactivo* (mañana/noche) ni una garantía de
contacto mínimo semanal. Eso es lo que esta estrategia agrega, reescribiendo el motor de
push del servidor (el único que llega con la app cerrada).

---

## 2. Principios

1. **Ritual, no spam** — momentos fijos y predecibles que el usuario aprende a esperar.
2. **Certero** — nunca recordar algo que el usuario ya hizo hoy.
3. **Noble** — sin culpa, sin urgencia agresiva; tono de identidad y coherencia.
4. **El usuario manda** — elige sus horas y puede apagar tipos de recordatorio.
5. **Respeto** — horario digno (nada de madrugada), tope diario, excluye suspendidos.

---

## 3. La estrategia — los 3 momentos

Todo por **push real** (Web Push + Service Worker), funciona con la app cerrada.

| # | Momento | Cuándo (def.) | Intención | Se OMITE si... | Deep-link |
|---|---------|---------------|-----------|----------------|-----------|
| 1 | 🌅 **Calibración matutina** | hora mañana del usuario · 8:00 | Elegir conscientemente el día | ya calibró hoy | Calibrar |
| 2 | 🌙 **Reflexión + hábitos** | hora noche del usuario · 20:00 | Cerrar el día, marcar hábitos | ya marcó hábitos hoy | Hábitos |
| 3 | 🎯 **Ancla de coherencia** | red de seguridad (ver §5) | Sostener el compromiso con su coherencia | la semana ya tiene ritmo suficiente | Home |

> El re-enganche graduado por ausencia larga (4+ días, copy según días fuera) **se
> conserva** como red de seguridad profunda.

---

## 4. Reglas operativas (lo que lo hace "noble y certero")

- **Tope: máximo 2 push/día.** El ancla de coherencia **reemplaza** un slot del día
  (toma la franja de la noche), **nunca se suma** — así nunca pasan de 2.
- **Certeza:** antes de enviar, se verifica la acción del día:
  - Calibración matutina → solo si `calibrations` no tiene fila de hoy.
  - Reflexión/hábitos → solo si `habit_tracker` de la semana no se actualizó hoy.
- **Horario noble:** no se envía nada entre **22:00 y 06:00** (hora local del usuario).
- **Excluye suspendidos:** `profiles.active = false` → cero push (pago pausado).
- **Requiere opt-in real:** debe existir suscripción en `push_subscriptions` y el
  usuario no haber apagado el tipo (`notif_enabled`).
- **Anti-duplicado:** cada envío se registra en `notification_log` con su `type`
  (`push_morning`, `push_evening`, `push_coherence`, `push_inactive`); un mismo tipo
  no se repite el mismo día.

---

## 5. La garantía de ≥3/semana — modo adaptativo

**Idea:** garantizar 3 "toques" por semana SIN molestar a quien ya está comprometido.

- **Toque semanal** = un día en que el usuario (a) recibió un push **o** (b) interactuó
  (calibró o marcó hábitos). La interacción cuenta: al comprometido no hay que recordarle.
- **Meta:** ≥ 3 días-con-toque por semana (lunes a domingo).
- **Ancla adaptativa:** a partir del **miércoles**, si el conteo de toques de la semana va
  por debajo del ritmo necesario para llegar a 3 el domingo, ese día se envía el nudge de
  coherencia (cuenta como toque y respeta el tope de 2/día).

**Efecto:**
- Usuario comprometido (entra a diario) → suma toques por interacción → casi nunca recibe
  el ancla. Cero ruido extra.
- Usuario que se está enfriando → el ancla completa hasta los 3, con tono que reconecta
  con su "para qué", no con culpa.

---

## 6. Cadencia — ejemplo de una semana

**Usuario A (comprometido):** calibra cada mañana antes de las 8 → la matutina casi nunca
dispara; recibe la nocturna solo los días que olvida los hábitos. Toques por interacción
≥ 5 → **0 anclas de coherencia**. Ritmo natural, sin saturar.

**Usuario B (intermitente):** calibra Lun y Jue. Lun=toque, Mar matutina (no calibró)=toque,
Jue=toque → llega a 3 sin ancla. Si solo hubiera calibrado el Lun, el miércoles el sistema
detecta que va corto y envía el ancla → garantiza los 3.

---

## 7. Tono y copys

**Marca de voz:** directo, filosófico, cálido (ver brand `SOUL.md`). Breve. Sin signos de
exclamación agresivos. Enfoque en identidad/coherencia, no en "no falles".

Cada momento tiene su **banco rotativo** (mín. 6 variantes, ES/EN) para que nunca se sienta
robótico. Ejemplos:

**Mañana (calibración):**
- "Tu momento llegó — 30 segundos para elegir conscientemente tu día."
- "¿Cómo quieres vivir hoy? Una calibración rápida y sigues."
- "Pausa. Respira. Calibra."

**Noche (reflexión + hábitos):**
- "Cierra tu día con honestidad: marca tus hábitos y reflexiona un momento."
- "¿Viviste hoy en coherencia con lo que elegiste esta mañana?"
- "Un minuto para cerrar el día: tus hábitos y una reflexión."

**Ancla de coherencia (noble):**
- "La coherencia no se trata de perfección, sino de volver. Hoy es un buen día para volver."
- "Recuerda tu para qué. Tu proceso sigue aquí, a tu ritmo."
- "Pequeños actos consistentes construyen la versión de ti que estás eligiendo."

---

## 8. Arquitectura técnica (para la implementación)

### Base de datos (`profiles`, idempotente)
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_morning_hour INT DEFAULT 8;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_evening_hour INT DEFAULT 20;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_enabled BOOLEAN DEFAULT true;
-- Migrar la preferencia actual a la hora de la mañana:
UPDATE profiles SET notif_morning_hour = COALESCE(notification_hour, 8)
  WHERE notif_morning_hour IS NULL;
```

### Edge function (reescribir `send-notifications`, cron horario ya activo)
Pseudocódigo por cada corrida (una por hora):
```
hora = hora_local_actual            // hoy hardcodeado a Colombia UTC-5
si hora en quiet-hours (22..6): salir
candidatos = profiles where role='client' AND active=true AND notif_enabled=true
candidatos = candidatos con push_subscription
para cada u en candidatos:
  ya_envie_hoy = notification_log(u, hoy).types
  si len(ya_envie_hoy) >= 2: continuar          // tope diario

  // 1. Matutina
  si hora == u.notif_morning_hour AND no calibró hoy AND 'push_morning' no enviado:
      enviar(morning); log('push_morning'); continuar

  // 2. Nocturna o Ancla (la noche es el slot compartido)
  si hora == u.notif_evening_hour:
      si toques_semana(u) va corto (>= miércoles): enviar(coherence); log('push_coherence')
      sino si no marcó hábitos hoy: enviar(evening); log('push_evening')
```
`toques_semana(u)` = días distintos (lun..hoy) con push en `notification_log` **o** con
calibración/hábito ese día.

### Frontend (`maat_dashboard.html`)
- Config en el perfil: 2 selectores de hora (mañana/noche) + toggle general.
- Deep-links del push: `morning→v-calib`, `evening→v-habitos`, `coherence→v-home`
  (el SW ya enruta por `data.view`).
- Alinear `scheduleNotifications` local como bonus con app abierta (mismos horarios).

### Higiene
- Limpiar suscripciones `410/404` (ya lo hace el motor actual).
- Todo `notification_log` permite medir (ver §9) y evita duplicados.

---

## 9. Cómo medimos si funciona

- **Tasa de calibración diaria** (calibraciones/usuarios activos) — la métrica norte.
- **% de hábitos marcados** por noche.
- **Retención D7/D30** y **racha promedio** (`streak`).
- **CTR del push** (instrumentar `track("push_open", {type})` en el deep-link).
- **Tasa de opt-out** (apagados de `notif_enabled`) — si sube, bajar intensidad.

---

## 10. Roadmap de implementación (cuando se apruebe)

1. **SQL** — columnas + migración de `notification_hour`.
2. **Edge function** — reescribir `send-notifications` con el motor de §8 (mantener el
   re-enganche por ausencia como fallback). Cron horario ya existe.
3. **Frontend** — config de horas + toggles + deep-links + bancos de copy ES/EN.
4. **QA** — invocar la función manualmente con usuarios de prueba en distintos estados.
5. **Medición** — instrumentar `push_open` y revisar a las 2 semanas; ajustar intensidad.

---

---

## 11. Estado: IMPLEMENTADO — activación

El motor y el editor de texto ya están construidos:
- `sql/maat_auto_notifications.sql` — slots en `notification_templates` + horas en `profiles`.
- `supabase/functions/send-notifications/index.ts` — **reescrito** como motor de ritual
  (mañana/noche/coherencia adaptativa/semanal), lee el texto de las plantillas por slot,
  con tope 2/día, horario noble, exclusión de suspendidos y dedup por `notification_log`.
- Portal mentor → **Notificaciones** → sección "Mensajes automáticos": editas el texto de
  cada franja cuando quieras; los próximos envíos lo toman.

### Pasos para activar
1. **SQL (en orden):** `sql/maat_notification_templates.sql` (si no se corrió antes) y
   luego `sql/maat_auto_notifications.sql`.
2. **Edge function:** `supabase functions deploy send-notifications --project-ref pcclptmojjzqmfmzftot`
   (el cron horario `0 * * * *` ya existe; auth por CRON_SECRET).
3. **Portal:** `./build_deploy.sh` + subir `deploy/mentor/index.html`.

### QA
- En Supabase, invoca `send-notifications` manualmente a distintas horas (o ajusta
  `notif_morning_hour`/`notif_evening_hour` de un cliente de prueba a la hora actual de
  Colombia) y verifica que llega el push correcto y que NO se repite (tope/dedup).
- Edita el texto de la franja "Mañana" en el portal y confirma que el siguiente envío usa
  el texto nuevo.
- Un cliente suspendido no debe recibir nada.

*Estrategia alineada con el diagnóstico psicosocial (re-enganche = prioridad #1) y con la
infraestructura PWA + Web Push ya existente.*
