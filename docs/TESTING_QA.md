# MAAT — Plan de Testing / QA

## Estado de Deploy

| Componente | Estado | Notas |
|------------|--------|-------|
| coach-maat | ACTIVE v22 | Migrado a Mistral API 2026-03-16 |
| maat-summary | ACTIVE v2 | Migrado a Mistral API 2026-03-16 |
| send-notifications | ACTIVE v14 | Desplegado 2026-03-16 |
| SQL fixes urgentes | EJECUTADO | Roles, RLS, handle_new_user |
| App Cliente | OPTIMIZADA | 7 fixes aplicados (último: .catch en push_subscriptions) |
| Portal Mentor | OK | Auditoría pasada |

## Secrets Requeridos en Supabase

Configurar en: Dashboard > Project Settings > Edge Functions > Secrets

```
VAPID_PUBLIC_KEY=BCOPiBDcnPi...    ✅ Configurado
VAPID_PRIVATE_KEY=ae7Lexp...       ✅ Configurado
CRON_SECRET=e3s8fXAE83h...         ✅ Configurado
```

> **Nota:** La API key de Mistral se almacena en la tabla `ai_config` (no en secrets).

**Verificar si la API key de Mistral está en ai_config:**
```sql
SELECT id, api_key IS NOT NULL AS has_key,
       length(api_key) AS key_length
FROM ai_config WHERE id = 1;
```

**Actualizar API key de Mistral (si es necesario):**
```sql
UPDATE ai_config SET api_key = 'TU_MISTRAL_API_KEY', updated_at = NOW() WHERE id = 1;
```

## Checklist de Testing Manual

### 1. Auth Flow (App Cliente)
- [ ] Login con email/password funciona
- [ ] Login con Google OAuth redirige correctamente
- [ ] Registro crea usuario con role='client' (verificar en profiles)
- [ ] Email de verificación se envía
- [ ] Sesión expirada muestra toast y redirige al login
- [ ] Logout limpia estado y vuelve a auth screen

### 2. Calibración
- [ ] Las 3 preguntas aceptan texto
- [ ] Slider de coherencia (1-10) funciona
- [ ] Nota de sesión opcional se guarda
- [ ] Guardar calibración → toast "Calibración guardada"
- [ ] Home se actualiza con nueva coherencia y última reflexión
- [ ] No permite guardar sin al menos 1 pregunta contestada

### 3. Hábitos
- [ ] Navegar entre semanas (1-16) con flechas
- [ ] 5 slots de hábitos con nombre editable
- [ ] Grid de 7 días (L-D) toggle on/off con animación
- [ ] Selector de frecuencia mínima (1-7d)
- [ ] Campos de intención, aprendizaje, sentimiento, creencia
- [ ] Guardar semana → toast "Semana guardada"
- [ ] Consolidado 16 semanas muestra índice MAAT correcto

### 4. Coach IA
- [ ] Chat muestra estado vacío inicial
- [ ] Enviar mensaje muestra typing indicator
- [ ] Respuesta del coach aparece en burbuja
- [ ] Error de red muestra mensaje amigable (no crash)
- [ ] Si API key no configurada → mensaje "Coach IA no activado"
- [ ] Historial de chat se mantiene en la sesión
- [ ] Máximo 20 mensajes de contexto enviados

### 5. Historial de Calibraciones
- [ ] Lista todas las calibraciones ordenadas por fecha
- [ ] Filtros: Todas, Esta semana, Alta coherencia, A trabajar
- [ ] Expandir entrada muestra preguntas + respuestas (sanitizadas)
- [ ] Editar nota de sesión y guardar

### 6. Creencias
- [ ] Registrar creencia con categoría (5 tipos)
- [ ] Eliminar creencia
- [ ] Contadores por categoría en pills

### 7. Statement & Autohipnosis
- [ ] Guardar statement de vida
- [ ] Subir audio (MP3/WAV/M4A, <50MB)
- [ ] Reproductor funciona (play, pause, skip ±30s, seek)
- [ ] Mini player en Home aparece si hay audio

### 8. Meditación
- [ ] Audio de meditación carga desde somosmaat.org
- [ ] Reproductor funciona correctamente
- [ ] Botón "IR A MI CALIBRACIÓN" navega correctamente

### 9. Progreso
- [ ] Gráfica de coherencia (últimas 7 entradas)
- [ ] 4 fases con semanas marcables (toggle completar)
- [ ] Reflexiones de fase editables y guardables
- [ ] Porcentaje de progreso global correcto

### 10. Perfil/Ajustes
- [ ] Cambiar nombre
- [ ] Cambiar semana actual (picker 1-16)
- [ ] Cambiar hora de notificación
- [ ] Toggle tema oscuro/claro
- [ ] Cambiar idioma ES/EN (toda la app se traduce)
- [ ] Guardar perfil → toast "Perfil actualizado"
- [ ] Cerrar sesión funciona

### 11. Push Notifications
- [ ] Prompt de activación aparece (una vez por sesión)
- [ ] "Sí, activar" → pide permiso del navegador
- [ ] Suscripción se guarda en push_subscriptions
- [ ] Service Worker registrado correctamente
- [ ] Clic en notificación navega a la vista correcta

### 12. Portal Mentor
- [ ] Login bloquea role='client'
- [ ] Resumen: stats de clientes, alertas, actividad reciente
- [ ] Clientes: grid de cards con métricas, búsqueda, crear nuevo
- [ ] Crear cliente: genera password seguro, guarda profile+mentor_clients
- [ ] Perfil cliente: métricas, gráficas, progreso, calibraciones, sesiones
- [ ] Resumen IA: llama maat-summary y muestra resultado
- [ ] Alertas: lista clientes inactivos/baja coherencia/bajos hábitos
- [ ] Notas de sesión: crear y listar por cliente
- [ ] Admin: cambiar roles, editar system prompt del Coach IA
- [ ] Configuración mentor: WhatsApp editable
- [ ] Tema oscuro/claro
- [ ] Responsive en mobile (sidebar drawer)

### 13. Edge Functions
- [x] coach-maat: 401 sin JWT ✅ (tested 2026-03-16)
- [x] coach-maat: 401 con anon key (no es user JWT) ✅
- [ ] coach-maat: 400 sin messages, 503 sin API key, 200 con todo OK
- [x] maat-summary: 401 sin JWT ✅ (tested 2026-03-16)
- [ ] maat-summary: 403 si es client, 400 sin client_id, 200 OK
- [x] send-notifications: 401 sin auth ✅ (tested 2026-03-16)
- [x] send-notifications: 200 con CRON_SECRET ✅ → `{"sent":0,"message":"No users matching this hour"}`

### 14. RLS & Seguridad
- [x] Cliente sin auth no puede ver calibrations (anon → []) ✅
- [x] Cliente sin auth no puede ver ai_config (anon → []) ✅
- [x] Cliente sin auth no puede ver push_subscriptions (anon → []) ✅
- [x] Cliente sin auth no puede ver notification_log (anon → []) ✅
- [x] Cliente sin auth no puede ver profiles (anon → []) ✅
- [x] INSERT en calibrations sin auth → RLS violation ✅
- [ ] Mentor solo ve sus clientes asignados (requiere test con user JWT)
- [ ] Admin ve todos los clientes (requiere test con admin JWT)
- [ ] XSS: verificar que todo input se sanitiza con san()

### 15. PWA & Offline
- [ ] App cliente se puede instalar como PWA
- [ ] Portal mentor muestra banner de instalación
- [ ] Banner offline aparece sin conexión

## Test rápido desde terminal

```bash
# 1. Verificar Edge Functions activas
supabase functions list

# 2. Test sin auth (debe devolver 401)
curl -s -X POST "https://pcclptmojjzqmfmzftot.supabase.co/functions/v1/coach-maat" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{"messages":[{"role":"user","content":"test"}]}'

# 3. Verificar ai_config tiene API key
# (ejecutar en Supabase SQL Editor)
SELECT id, api_key IS NOT NULL AS has_key FROM ai_config WHERE id = 1;

# 4. Verificar roles correctos
SELECT email, role FROM profiles ORDER BY role, email;

# 5. Verificar RLS en notification_log
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'notification_log';
```

## Cron para send-notifications

En el Dashboard de Supabase > SQL Editor, ejecutar en este orden:

### Paso 1: Activar extensiones
Dashboard > Database > Extensions → Activar **pg_cron** y **pg_net**

### Paso 2: Guardar el CRON_SECRET como setting de la BD
```sql
ALTER DATABASE postgres SET app.settings.cron_secret = 'e3s8fXAE83hSF+zwjaEyUwKjYdgah46C6dmz95cZbFA=';
```

### Paso 3: Programar ejecución cada hora
```sql
SELECT cron.schedule(
  'maat-push-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pcclptmojjzqmfmzftot.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### Verificar
```sql
-- Ver jobs programados
SELECT * FROM cron.job;

-- Ver ejecuciones recientes
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;

-- Eliminar (si necesitas cambiar)
SELECT cron.unschedule('maat-push-hourly');
```
