# Salud del sistema: vigilante de crons y push

**Por que existe:** en septiembre las notificaciones dejaron de salir por un 401 silencioso (los crons "corrian bien" pero la
funcion rechazaba la llamada) y nadie se entero. `pg_cron` solo dice "la llamada salio"; el resultado real queda en
`net._http_response`. Este vigilante lo mira cada hora.

## Piezas
| Pieza | Donde |
|---|---|
| SQL (RUNBOOK #24) | `sql/maat_system_health.sql` — `system_alerts`, `_system_health_raw()`, `admin_system_health()`, cron `maat-health-watch` |
| Funcion | `supabase/functions/health-watch/` — `core.ts` (reglas, probadas) + `index.ts` |
| Panel | tarjeta "Salud del sistema" en `/panel/` (lee `admin_system_health()`; mentor/admin) |

## Que vigila (reglas en `core.ts`)
1. Una tarea pg_cron **desactivada** o con su **ultima corrida fallida**.
2. Una tarea **atrasada** (sin correr en mas de 2 intervalos + 15 min).
3. **Llamadas HTTP fallidas** (4xx/5xx/timeout) de las tareas en las ultimas 6 h — el caso del 401.
4. **Silencio de push**: ningun push en 48 h cuando antes enviaba con normalidad.

Cada problema se avisa **una vez cada 12 h** (por correo + fila en `system_alerts`). El panel muestra "ATENCION" si hay errores,
tareas caidas, alertas en 24 h o si el propio vigilante dejo de correr (>3 h).

## Puesta en marcha (1 vez)
1. Supabase > SQL Editor: correr `sql/maat_system_health.sql`.
2. Desplegar (ya hecho el 1-nov-2026): `supabase functions deploy health-watch --no-verify-jwt --project-ref pcclptmojjzqmfmzftot`.
3. Probar sin enviar nada: `curl -X POST .../functions/v1/health-watch -H "Authorization: Bearer $CRON_SECRET" -d '{"dry":true}'`.
4. Probar el correo: mismo comando con `-d '{"test":true}'`.

Correo: usa los secretos `SMTP_*` que ya tiene `testimonial`. Destino: `HEALTH_NOTIFY_EMAIL` (si no existe, `TESTIMONIAL_NOTIFY_EMAIL`, y si no `SMTP_USERNAME`).

## Si llega una alerta
- `http_errors` con **401**: casi seguro una funcion de cron desplegada sin `--no-verify-jwt`. Ver `config.toml` y volver a desplegar con la bandera.
- `job_stale` / `job_inactive`: revisar `SELECT * FROM cron.job;` y `cron.job_run_details`.
- `push_silence`: revisar VAPID, `notification_log` y los logs de `send-notifications` en el Dashboard.
