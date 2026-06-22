# MAAT - Gestor de notificaciones del mentor

> El mentor compone un push (titulo + mensaje), lo envia en el momento a TODOS sus
> clientes o a un GRUPO, y puede guardarlo como plantilla reutilizable. Para mantener
> las notificaciones dinamicas sin depender del motor automatico.

## Que se construyo

| Pieza | Archivo | Que hace |
|-------|---------|----------|
| Schema | `sql/maat_notification_templates.sql` | Tabla `notification_templates` (titulo, body, audiencia all/group, group_id) + RLS |
| Edge fn | `supabase/functions/send-custom-push/index.ts` | Valida mentor/admin y propiedad del grupo, resuelve destinatarios, envia push, registra notification_log (push_custom) |
| Portal | `src/maat_mentor_dashboard.html` | Pestana **Notificaciones**: componer + Enviar ahora + Guardar/Editar/Eliminar plantillas |

## Como funciona

- **Audiencia "Todos":** admin -> todos los clientes activos; mentor -> sus clientes
  asignados (`mentor_clients`).
- **Audiencia "Grupo":** los miembros activos del grupo (valida que el mentor sea duenno).
- **Excluye suspendidos** (`profiles.active=false`) y solo llega a quien tiene suscripcion push.
- **Plantillas:** se guardan con su audiencia y se reutilizan con un clic ("Enviar").
  Tambien serviran de banco de copys para el motor automatico cuando se construya
  (ver `docs/ESTRATEGIA_NOTIFICACIONES.md`).
- El push aterriza en el Home de la app (deep-link `data.view=home`).

## Activacion (pasos del usuario)

1. **SQL:** correr `sql/maat_notification_templates.sql` en Supabase (proyecto
   `pcclptmojjzqmfmzftot`). Idempotente.
2. **Edge function (con verify-jwt, SIN --no-verify-jwt):**
   ```bash
   supabase functions deploy send-custom-push --project-ref pcclptmojjzqmfmzftot
   ```
3. **Re-desplegar el portal:** `./build_deploy.sh` y subir `deploy/mentor/index.html`.

## QA

1. Portal mentor > pestana **Notificaciones**.
2. Escribir titulo + mensaje, audiencia **Todos**, **Enviar ahora** > confirma > toast con
   conteo de dispositivos/clientes. Un cliente con la app instalada y permiso recibe el push.
3. **Guardar plantilla** > aparece en la lista; **Enviar** desde la lista la reenvia y
   actualiza la fecha "enviado".
4. Audiencia **Grupo** > selector de grupo > envia solo a ese cohort.
5. Un cliente **suspendido** no debe recibir el push.
