# sql/ — RUNBOOK

> Orden y estado de cada archivo. **Todos son idempotentes** (re-correr no rompe),
> pero el orden importa por dependencias. Proyecto: `pcclptmojjzqmfmzftot` (MAAT, no el CRM).
> Estado al 26-ago-2026 — si aplicas algo nuevo, actualiza este archivo.

## Reconstruccion desde cero (orden)

| # | Archivo | Que crea | Estado en prod |
|---|---------|----------|----------------|
| 1 | `maat_setup_master.sql` | Las 13 tablas nucleo + RLS + helpers (`get_my_role`...) | ✅ aplicado |
| 2 | `maat_fixes_urgentes.sql` | Fixes post-setup (handle_new_user, policies) | ✅ aplicado |
| 3 | `fix_session_notes_rls.sql` | RLS de session_notes | ✅ aplicado |
| 4 | `maat_usage_events.sql` | Tabla usage_events (instrumentacion) | ✅ aplicado |
| 5 | `maat_fase1_graduados_meditaciones_eventos.sql` | graduated, meditations, events | ✅ aplicado |
| 6 | `maat_storage_policies_meditations.sql` | Policies de storage (audios) | ✅ aplicado |
| 7 | `maat_comunimaat.sql` | community_posts/reactions + avatares | ✅ aplicado |
| 8 | `maat_comunimaat_links.sql` | Link-preview en posts | ✅ aplicado |
| 9 | `maat_community_pulse.sql` | RPC get_community_pulse | ✅ aplicado |
| 10 | `maat_mentorias_grupales.sql` | mentor_groups/members/sessions | ✅ aplicado |
| 11 | `maat_session_notes_grupales.sql` | Notas broadcast a grupo | ✅ aplicado |
| 12 | `maat_suspension_pagos.sql` | paid_through, suspended_at | ✅ aplicado |
| 13 | `maat_notification_templates.sql` | notification_templates | ✅ aplicado |
| 14 | `maat_auto_notifications.sql` | Slots del ritual + horas en profiles | ✅ aplicado |
| 15 | `maat_cron_session_reminders.sql` | Cron */15 session-reminders | ✅ aplicado |
| 16 | `maat_traction_metrics.sql` | RPC de metricas de traccion | ✅ aplicado |
| 17 | `maat_biotipos.sql` | Biotipo en profiles + quiz | ✅ aplicado |
| 18 | `maat_client_feedback.sql` | client_feedback + client_referrals + RPC overview | ✅ aplicado |
| 19 | `maat_notif_expansion.sql` | Slots inactive/community/session_prep + flags | ✅ aplicado |
| 20 | `maat_cron_community_activity.sql` | Cron 3h community-activity | ✅ aplicado |
| 21 | `maat_notif_custom.sql` | profiles.notif_custom_morning | ✅ aplicado |
| 22 | `maat_ritual_cierre.sql` | Columnas del ritual de cierre en calibrations | ✅ aplicado |

## Mantenimiento puntual (correr cuando aplique)

| Archivo | Uso |
|---------|-----|
| `maat_update_coach_prompt.sql` | Actualizar el system prompt del Coach IA |
| `maat_fix_high_priority.sql` / `maat_fix_low_priority.sql` | Fixes de auditoria vieja — ✅ aplicados |
| `crm_ajuste_requerido.sql` | Instrucciones para el proyecto CRM (otro Supabase) — informativo |

## Diagnostico (solo lectura, correr cuando quieras datos)

| Archivo | Que responde |
|---------|--------------|
| `maat_diagnostico_fase0.sql` | Embudo de activacion/retencion original |
| `maat_diagnostico_calibracion.sql` | Quien calibra, en que semana se caen, express vs profunda |

## Reglas

- Nada de aqui se corre solo: **SQL Editor del Dashboard**, a mano.
- Politicas RLS: jamas consultar la propia tabla (Regla 3, `get_my_role()`).
- Si un archivo nuevo depende de otro, anotarlo aqui al crearlo.
