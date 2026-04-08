# MAAT — Sistema de Mentoría de 16 Semanas

## Qué es este proyecto

MAAT es un sistema de mentoría que integra neurociencia aplicada, filosofía práctica y metacognición. Dirigido a profesionales de alto rendimiento que han perdido sentido, pasión y energía — trabajan en automático, sin propósito.

**DOS productos digitales**, misma base de datos Supabase:

1. **App del Cliente** (`src/maat_dashboard.html`) — PWA móvil, acompañamiento diario, 16 semanas
2. **Portal del Mentor** (`src/maat_mentor_dashboard.html`) — Dashboard web, monitoreo de clientes

**Sitio:** somosmaat.org | **Supabase project:** `pcclptmojjzqmfmzftot`

## Stack técnico

- **Frontend:** HTML5 + CSS3 + Vanilla JS — UN SOLO archivo `.html` por app (CSS y JS inline)
- **Backend/DB:** Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **IA:** Mistral (mistral-large-latest) via Supabase Edge Function (proxy seguro)
- **Deploy:** WordPress/Elementor en somosmaat.org — widgets HTML embebidos
- **Push:** Web Push API + Service Worker (`sw.js` separado)
- **Fonts:** Saira Condensed (títulos, logos) + Sora (cuerpo)
- **Audio:** HTML5 Audio API — meditación guiada + autohipnosis

## Estructura del proyecto

```
maat-project/
├── CLAUDE.md                              ← ESTE ARCHIVO
├── docs/
│   ├── ARQUITECTURA.md                    ← Documento madre de arquitectura
│   └── TESTING_QA.md                      ← Checklist de QA + secrets + cron
├── src/
│   ├── maat_dashboard.html                ← App del Cliente (~2187 líneas)
│   ├── maat_mentor_dashboard.html         ← Portal del Mentor (~308 líneas)
│   └── sw.js                              ← Service Worker (push notifications)
├── sql/
│   ├── maat_setup_master.sql              ← SQL maestro completo (idempotente)
│   ├── maat_fixes_urgentes.sql            ← Fixes para BD en producción
│   └── crm_ajuste_requerido.sql           ← Instrucciones para proyecto CRM
└── supabase/
    └── functions/
        ├── coach-maat/index.ts            ← Edge Function Coach IA (proxy Mistral)
        ├── maat-summary/index.ts          ← Edge Function Resumen IA (Mistral)
        └── send-notifications/index.ts    ← Edge Function push (cron)
```

## 6 Reglas de arquitectura INQUEBRANTABLES

### REGLA 1 — Un archivo por app
Cada app es UN SOLO `.html` con CSS y JS inline. Sin npm, sin bundler, sin archivos separados.

### REGLA 2 — Sin `.catch()` encadenado en Supabase v2
```js
// ✅ CORRECTO
const { data, error } = await sb.from("tabla").select("*").eq("id", uid);
// ❌ INCORRECTO — error silencioso
await sb.from("tabla").select("*").catch(e => console.log(e));
```

### REGLA 3 — RLS sin recursión
Políticas RLS NUNCA consultan la misma tabla. Usar `get_my_role()` SECURITY DEFINER.

### REGLA 4 — Roles en `profiles.role`
Valores: `"client"`, `"mentor"`, `"admin"`. Portal mentor bloquea si es client.

### REGLA 5 — Supabase client aislado para crear clientes
Instancia separada con `{ auth: { persistSession: false } }`.

### REGLA 6 — `Promise.allSettled()` para carga de datos
NUNCA `Promise.all()`. Un fallo en una tabla no rompe la carga completa.

## Credenciales Supabase

```
URL: https://pcclptmojjzqmfmzftot.supabase.co
ANON KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjY2xwdG1vamp6cW1mbXpmdG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTg3MjAsImV4cCI6MjA4NzQ3NDcyMH0.VuFBEy19fgNN5pSp_r8p2ZVViniunKdVW7Hy3AmqJXE
```

## Base de datos — Tablas MAAT (13)

> **IMPORTANTE:** Esta BD es compartida con un proyecto CRM (13 tablas adicionales: prospects, activities, pipeline_stages, email_templates, sent_emails, ad_accounts, campaigns, ad_sets, ads, daily_metrics, metric_breakdowns, ai_recommendations, alerts). NO tocar tablas CRM.

**profiles** — id(UUID PK → auth.users), full_name, email(UNIQUE NOT NULL), role(client/mentor/admin), active(bool), current_week(1-16), notification_hour(0-23), preferred_lang(es/en), whatsapp_number, phone, avatar_url, created_at

**calibrations** — id, user_id(FK), date(text), week(1-16), coherence(1-10), answer_q1, answer_q2, answer_q3, session_note, created_at. UNIQUE(user_id,date)

**beliefs** — id, user_id(FK), text(NOT NULL), category(Supervivencia/Limitante/Neutral/Elegida/Expansiva), date, created_at

**week_progress** — id, user_id(FK), week, completed(bool). UNIQUE(user_id,week)

**habit_tracker** — id, user_id(FK), week, habits(JSONB: [{name,frequency,days:[bool×7]}]), intention, learned, felt, belief, updated_at. UNIQUE(user_id,week)

**statement_hipnosis** — id, user_id(FK UNIQUE), statement, audio_url, audio_name, updated_at

**phase_reflections** — id, user_id(FK), phase_id(1-4), reflection, updated_at. UNIQUE(user_id,phase_id)

**ai_config** — id(=1), system_prompt, api_key(NEVER frontend), updated_at

**mentor_clients** — id, mentor_id(FK), client_id(FK), active(bool), assigned_at. UNIQUE(mentor_id,client_id)

**session_notes** — id, mentor_id(FK), client_id(FK), session_type(1on1/async/group), session_date, notes, next_plan, client_week, client_coherence_avg, created_at

**push_subscriptions** — id, user_id(FK), endpoint, p256dh, auth_key, device_name, created_at. UNIQUE(user_id,endpoint)

**chat_messages** — id, user_id(FK UNIQUE), messages(JSONB), updated_at

**notification_log** — id, user_id(FK), type(text NOT NULL), sent_at, days_absent

## Funciones críticas

```sql
-- RLS sin recursión (Regla 3)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT COALESCE(role, 'client') FROM profiles WHERE id = auth.uid();
$$;

-- Auto-crear profile en signup (default: client para MAAT, advisor via metadata para CRM)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
```

**Helpers adicionales:** `is_admin(uid)`, `is_mentor_or_admin(uid)`, `mentor_has_client(mentor_uid, client_uid)`

## Proceso MAAT — 4 Fases

| Fase | Semanas | Nombre | Keyword | Color |
|------|---------|--------|---------|-------|
| 1 | 1-4 | GRATITUD | UNCOVER | #39A1C9 |
| 2 | 5-8 | AMOR | REWRITE | #EBA055 |
| 3 | 9-12 | INTENCIÓN | REBUILD | #7DCD93 |
| 4 | 13-16 | VOLUNTAD | INTEGRATE | #89608E |

## Paleta de colores

```css
--c:#39A1C9; --o:#EBA055; --m:#7DCD93; --v:#89608E; --r:#D76B6E;
--bg:#0d1117; --bg2:#111827; --text:#e8eaf0; --mu:#8892a4; --mu2:#6b7280;
--bd:rgba(255,255,255,0.08);
/* Light: --bg:#f0f4f8 --bg2:#e2e8f0 --text:#1a2030 --mu:#5a6377 */
```

## Patrones de código obligatorios

- **Botones:** disabled + textContent loading → try/finally restore
- **Auth errors:** chkAuthErr() detecta jwt/expired → doLogout()
- **XSS:** san() en TODA inyección a innerHTML
- **Eventos:** data-attributes + event delegation, NUNCA onclick con datos
- **Contraseñas:** crypto.getRandomValues(), NUNCA Math.random()

## Métricas clave

- **Coherencia** = promedio de % cumplimiento por hábito (frequency-aware)
- **Actitud** = campo coherence en calibrations (1-10, promedio últimas 7)
- **Hábitos %** = días cumplidos / días esperados × 100
- **Streak** = días consecutivos con calibración
- **Alertas mentor:** sin calibrar ≥3d, coherencia <30%, hábitos <30%

## Edge Functions — Deploy

Para desplegar las Edge Functions necesitas Supabase CLI:
```bash
# Instalar (si no está)
npm install -g supabase

# Login
supabase login

# Vincular proyecto
supabase link --project-ref pcclptmojjzqmfmzftot

# La API key de Mistral se lee de ai_config tabla (ya configurado)
# Secrets ya configurados: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET

# Desplegar
supabase functions deploy coach-maat
supabase functions deploy maat-summary
```

**coach-maat** — Proxy seguro para el Coach IA (Mistral). Recibe `{messages}`, retorna `{reply}`.
**maat-summary** — Resumen IA del progreso de un cliente (Mistral). Recibe `{client_id}`, retorna `{summary}`.
**send-notifications** — Push notifications cron. Auth via CRON_SECRET o admin JWT.

## Pendientes

- [x] Archivo SQL maestro (sql/maat_setup_master.sql)
- [x] Fixes urgentes BD (sql/maat_fixes_urgentes.sql) — EJECUTADO
- [x] Instrucciones CRM (sql/crm_ajuste_requerido.sql)
- [x] Edge Function coach-maat (supabase/functions/coach-maat/index.ts)
- [x] Edge Function maat-summary (supabase/functions/maat-summary/index.ts)
- [x] Service Worker (src/sw.js)
- [x] Auditoría y optimización de ambas apps HTML
- [x] Deploy Edge Functions a Supabase (coach-maat v21, maat-summary v1, send-notifications v14)
- [x] Edge Function send-notifications (push scheduling completo)
- [x] Plan de Testing/QA (docs/TESTING_QA.md)
- [x] Migrar Edge Functions de Anthropic → Mistral API (coach-maat + maat-summary)
- [x] Configurar VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY en Supabase secrets
- [x] Configurar CRON_SECRET en Supabase secrets
- [ ] Actualizar api_key en tabla ai_config con key Mistral (SQL en Dashboard)
- [x] Activar pg_cron + pg_net y programar send-notifications (cron activo: 0 * * * *)
- [x] UNIQUE(user_id, date) en calibrations + guard frontend anti-duplicado
- [ ] Testing/QA manual end-to-end (ver docs/TESTING_QA.md)
