// Edge Function: session-reminders
// Envia push de recordatorio para sesiones de mentoria AGENDADAS (mentor_sessions),
// tanto grupales como 1:1.
//
// Flujo:
// 1. Verifica Authorization (cron secret o admin JWT)
// 2. Busca sesiones status='scheduled' en las proximas ~26h
// 3. Para cada offset de reminder_offsets que aun no se envio y cuya ventana llego,
//    resuelve destinatarios (miembros activos del grupo, o el cliente 1:1)
// 4. Envia Web Push a cada suscripcion
// 5. Marca el offset en reminders_sent y registra en notification_log (type='push_session')
//
// Deploy: supabase functions deploy session-reminders
// Cron recomendado: "*/15 * * * *" (cada 15 min) para que el recordatorio de 15 min
//   tambien dispare. Con cron horario solo los offsets >= 60 min son fiables.
// Env opcional: REMINDER_GRACE_MIN (default 30) = ventana en minutos para no disparar
//   un recordatorio "tarde" (debe ser >= al intervalo del cron).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const graceMin = parseInt(Deno.env.get("REMINDER_GRACE_MIN") || "30") || 30;

    // ---- Authorization: cron secret o admin JWT ----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    let authorized = false;
    if (cronSecret && token === cronSecret) authorized = true;
    if (!authorized) {
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const sbUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sbUser.auth.getUser();
      if (user) {
        const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const { data: profile } = await sbAdmin
          .from("profiles").select("role").eq("id", user.id).single();
        if (profile?.role === "admin") authorized = true;
      }
    }
    if (!authorized) {
      return json({ error: "Unauthorized" }, 401);
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    if (!vapidPublicKey || !vapidPrivateKey) {
      return json({ error: "VAPID keys not configured" }, 503);
    }
    // Configurar UNA sola vez (antes se hacia por cada push individual, sumando latencia).
    webpush.setVapidDetails("mailto:hello@somosmaat.org", vapidPublicKey, vapidPrivateKey);

    const now = Date.now();
    const graceMs = graceMin * 60 * 1000;
    const windowEnd = new Date(now + 26 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    // ---- Sesiones agendadas en la ventana proxima ----
    const { data: sessions, error: sErr } = await sb
      .from("mentor_sessions")
      .select("id, modality, group_id, client_id, title, scheduled_at, location, reminder_offsets, reminders_sent")
      .eq("status", "scheduled")
      .gte("scheduled_at", nowIso)
      .lte("scheduled_at", windowEnd);

    if (sErr) {
      console.error("Query mentor_sessions error:", sErr);
      return json({ error: "Database error" }, 500);
    }
    if (!sessions || sessions.length === 0) {
      return json({ sent: 0, message: "No upcoming sessions in window" }, 200);
    }

    let totalSent = 0;
    let totalExpired = 0;
    const fired: string[] = [];

    for (const s of sessions) {
      const scheduledMs = new Date(s.scheduled_at).getTime();
      const offsets: number[] = s.reminder_offsets || [];
      const alreadySent: number[] = s.reminders_sent || [];

      // Offsets cuya ventana de envio llego y aun no se enviaron.
      const dueOffsets = offsets.filter((off) => {
        if (alreadySent.includes(off)) return false;
        const remindAt = scheduledMs - off * 60 * 1000;
        return now >= remindAt && now < scheduledMs && (now - remindAt) <= graceMs;
      });
      if (dueOffsets.length === 0) continue;

      // ---- Resolver destinatarios ----
      let recipientIds: string[] = [];
      if (s.modality === "group" && s.group_id) {
        const { data: mem } = await sb
          .from("mentor_group_members")
          .select("client_id")
          .eq("group_id", s.group_id)
          .eq("active", true);
        recipientIds = (mem || []).map((m) => m.client_id);
      } else if (s.client_id) {
        recipientIds = [s.client_id];
      }
      if (recipientIds.length === 0) {
        // Sin destinatarios: marcar offsets como enviados para no reprocesar.
        await markSent(sb, s.id, alreadySent, dueOffsets);
        continue;
      }

      // ---- Suscripciones push de los destinatarios ----
      const { data: subs } = await sb
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth_key")
        .in("user_id", recipientIds);

      // Usamos el offset mas urgente (menor) para el copy del mensaje.
      const minOffset = Math.min(...dueOffsets);
      const msg = buildReminderMessage(minOffset, s);

      if (subs && subs.length > 0) {
        const payload = JSON.stringify({
          title: msg.title,
          body: msg.body,
          icon: "https://www.somosmaat.org/wp-content/uploads/2026/02/logo_app.png",
          badge: "https://www.somosmaat.org/wp-content/uploads/2026/02/logo_app.png",
          data: { view: "sesiones" },
        });

        // Enviar TODOS los push EN PARALELO (antes: uno por uno -> superaba el
        // timeout de 5s de pg_net cuando habia varios destinatarios reales).
        const expiredIds: string[] = [];
        const results = await Promise.allSettled(
          subs.map((sub) => sendWebPush({
            endpoint: sub.endpoint, p256dh: sub.p256dh, authKey: sub.auth_key, payload,
          }))
        );
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            if (r.value.ok) totalSent++;
            else if (r.value.status === 410 || r.value.status === 404) expiredIds.push(subs[i].id);
          } else {
            console.error("Push error:", r.reason);
          }
        });
        if (expiredIds.length > 0) {
          await sb.from("push_subscriptions").delete().in("id", expiredIds);
          totalExpired += expiredIds.length;
        }

        // Log de notificaciones (uno por destinatario notificado).
        const logs = recipientIds.map((uid) => ({
          user_id: uid,
          type: "push_session",
          sent_at: new Date().toISOString(),
          days_absent: null as number | null,
        }));
        await sb.from("notification_log").insert(logs);
      }

      await markSent(sb, s.id, alreadySent, dueOffsets);
      fired.push(s.id);
    }

    return json({
      sent: totalSent,
      expired: totalExpired,
      sessions_fired: fired.length,
      message: `Reminders fired for ${fired.length} session(s)`,
    }, 200);
  } catch (err) {
    console.error("session-reminders error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Marca offsets como enviados (append sin duplicar).
async function markSent(
  sb: ReturnType<typeof createClient>,
  sessionId: string,
  already: number[],
  justSent: number[],
): Promise<void> {
  const merged = Array.from(new Set([...already, ...justSent]));
  await sb.from("mentor_sessions").update({ reminders_sent: merged }).eq("id", sessionId);
}

// Copy del recordatorio segun cuanto falta. Hora mostrada en zona Colombia (UTC-5).
function buildReminderMessage(
  offsetMin: number,
  s: { modality: string; title?: string; location?: string; scheduled_at: string },
): { title: string; body: string } {
  const isGroup = s.modality === "group";
  const title = isGroup ? "Sesion grupal de mentoria" : "Tu sesion 1:1 de mentoria";

  let when: string;
  if (offsetMin >= 1440) when = `manana a las ${formatTimeCO(s.scheduled_at)}`;
  else if (offsetMin >= 60) {
    const h = Math.round(offsetMin / 60);
    when = h <= 1 ? "en 1 hora" : `en ${h} horas`;
  } else when = `en ${offsetMin} minutos`;

  const extra = s.title ? ` ${s.title}.` : "";
  const place = s.location ? ` Lugar: ${s.location}.` : "";
  return { title, body: `Comienza ${when}.${extra}${place}` };
}

// Hora local de Colombia (UTC-5) en formato 12h, ej "7:00 PM".
function formatTimeCO(iso: string): string {
  const d = new Date(iso);
  const co = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  let h = co.getUTCHours();
  const mi = String(co.getUTCMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mi} ${ap}`;
}

// Envia Web Push. webpush ya viene importado y configurado (setVapidDetails) arriba.
async function sendWebPush(opts: {
  endpoint: string;
  p256dh: string;
  authKey: string;
  payload: string;
}): Promise<Response> {
  const subscription = {
    endpoint: opts.endpoint,
    keys: { p256dh: opts.p256dh, auth: opts.authKey },
  };
  try {
    await webpush.sendNotification(subscription, opts.payload);
    return new Response("ok", { status: 201 });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; body?: string };
    return new Response(error.body || "Push failed", { status: error.statusCode || 500 });
  }
}
