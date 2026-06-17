# MAAT - Feature: Mentorias Grupales + Agenda de Sesiones (Sprint A)

> Permite organizar clientes en cohortes (mentorias grupales) ademas de las 1:1,
> agendar sesiones con fecha/hora, y enviar recordatorios push automaticos a los
> usuarios (grupales y 1:1).

## Que se construyo

| Pieza | Archivo | Que hace |
|-------|---------|----------|
| Schema | `sql/maat_mentorias_grupales.sql` | 3 tablas: `mentor_groups`, `mentor_group_members` (1 grupo activo por cliente), `mentor_sessions` (agenda con recordatorios) + RLS |
| Portal mentor | `src/maat_mentor_dashboard.html` | Pestana **Mentorias Grupales**: crear grupo, gestionar miembros, coherencia promedio del cohort, badge grupo vs 1:1, agendar sesion (fecha/hora + recordatorios) |
| Notificaciones | `supabase/functions/session-reminders/index.ts` | Edge function (cron) que envia push de recordatorio antes de cada sesion, a miembros del grupo o al cliente 1:1 |
| App cliente | `src/maat_dashboard.html` | Vista **Mis Sesiones** + banner de "Proxima sesion" en el home; el push aterriza aqui |

## Conceptos clave

- **`session_notes`** (ya existia) = registro POSTERIOR de la sesion (conclusiones, ejercicios).
- **`mentor_sessions`** (nuevo) = sesion AGENDADA con fecha/hora; dispara los recordatorios.
- Un cliente solo puede estar en **un grupo activo a la vez** (indice unico parcial).
- Los recordatorios por defecto son **24h y 1h antes** (configurable por sesion: 24h / 1h / 15min).

## Activacion (pasos del usuario)

### 1. Ejecutar el SQL
Supabase Dashboard > SQL Editor (proyecto `pcclptmojjzqmfmzftot`) > pegar y correr
`sql/maat_mentorias_grupales.sql`. Es idempotente.

### 2. Desplegar la edge function de recordatorios
```bash
supabase link --project-ref pcclptmojjzqmfmzftot   # confirmar proyecto correcto
supabase functions deploy session-reminders
```
Reutiliza los secrets ya configurados: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`.

### 3. Programar el cron
En Supabase (pg_cron, igual que `send-notifications`), agendar:
```
*/15 * * * *   ->  POST /functions/v1/session-reminders
                   Header: Authorization: Bearer <CRON_SECRET>
```
**Por que cada 15 min:** para que el recordatorio de "15 minutos antes" dispare.
Con cron horario solo los offsets >= 60 min son fiables. Si se deja horario, ajustar
el secret `REMINDER_GRACE_MIN=65`.

### 4. Re-desplegar las apps
```bash
./build_deploy.sh
```
Subir `deploy/app/index.html` y `deploy/mentor/index.html` al servidor (FTP/cPanel).

## QA manual (tras activar)

1. Portal mentor > **Mentorias Grupales** > Crear Grupo.
2. **Miembros** > asignar 2-3 clientes. Verificar que un cliente ya asignado a otro
   grupo aparece deshabilitado.
3. En **Mis Clientes**, las tarjetas muestran el badge del grupo (o "Individual 1:1").
4. **+ Agendar Sesion** (grupal) en ~20 min, con recordatorio de 15 min.
5. App cliente de un miembro: aparece banner "Proxima sesion" en home y la vista
   **Mis Sesiones** (en Mas).
6. Esperar al cron / invocar `session-reminders` manualmente: debe llegar el push a
   todos los miembros. Al tocarlo, la app abre en **Mis Sesiones**.

## Notas tecnicas

- RLS: el cliente solo ve su propio grupo y sus sesiones; el mentor solo las suyas;
  admin ve todo. Helpers `mentor_owns_group()` y `my_group_ids()` evitan recursion (Regla 3).
- `scheduled_at` se guarda en UTC; la app lo muestra en hora local del dispositivo.
  El push formatea la hora en zona Colombia (UTC-5).
- `reminders_sent` evita reenviar el mismo recordatorio; la ventana de gracia evita
  disparar un recordatorio "tarde" si la sesion se creo con poco margen.

## Sprint B - Notas/tareas grupales (broadcast) - APLICADO

El mentor escribe **una vez** las notas y la tarea de una sesion grupal y se guardan
para **todos los miembros activos** del grupo (una `session_notes` por miembro), con
push opcional. Cada cliente las ve en su app en "Notas de mi Mentor" (en vivo si la
app esta abierta, via realtime).

| Pieza | Archivo | Que hace |
|-------|---------|----------|
| Schema | `sql/maat_session_notes_grupales.sql` | `session_notes.group_id` (FK, nullable) + indice |
| Edge fn | `supabase/functions/broadcast-session-notes/index.ts` | Valida que el mentor sea duenno del grupo, inserta 1 nota por miembro, push opcional |
| Portal mentor | boton **Notas/Tareas** en cada grupo + modal (fecha, notas, tarea, checkbox push) + historial de envios por grupo. La pestana "Notas de Sesion" ahora muestra solo 1:1 |
| App cliente | etiqueta amigable ("Sesion grupal"/"1:1") en Notas de mi Mentor; el push aterriza en esa vista |

### Activacion Sprint B (pasos del usuario)

1. **SQL:** correr `sql/maat_session_notes_grupales.sql` en Supabase. Idempotente.
2. **Edge function (con verificacion JWT, SIN --no-verify-jwt):**
   ```bash
   supabase functions deploy broadcast-session-notes --project-ref pcclptmojjzqmfmzftot
   ```
3. **Re-desplegar apps:** `./build_deploy.sh` y subir `deploy/app/index.html` +
   `deploy/mentor/index.html`.

### QA Sprint B
1. Portal mentor > Mentorias Grupales > en un grupo con miembros, **Notas/Tareas**.
2. Escribir notas + tarea, dejar el push marcado, **ENVIAR A TODOS**.
3. Toast confirma "Enviado a N miembro(s)". El historial aparece en la tarjeta del grupo.
4. App de un miembro: la nota aparece en "Notas de mi Mentor" (toast en vivo si esta
   abierta) y, si concedio permiso, llega el push.
