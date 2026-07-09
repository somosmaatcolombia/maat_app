// Edge Function: send-notifications  (MOTOR DE RITUAL)
// Notificaciones automaticas diarias/semanales con texto EDITABLE desde el portal.
//
// Por cada corrida (cron horario) decide, para cada cliente, si toca enviar:
//   - manana   (push_morning):   a su hora matutina, si NO calibro hoy
//   - noche    (push_evening):   a su hora nocturna, si NO marco habitos hoy
//   - coherencia (push_coherence): ancla adaptativa si la semana va corta de toques
//   - semanal  (push_weekly):    domingo en la hora nocturna
// Reglas: maximo 2/dia, horario noble (22-6 no), excluye suspendidos, no repite tipo
//   el mismo dia. El texto sale de notification_templates (slot activo) o de un default.
//
// Deploy: supabase functions deploy send-notifications
// Cron: "0 * * * *" (ya activo). Auth: CRON_SECRET o admin JWT.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CO_OFFSET_MS = 5 * 60 * 60 * 1000; // Colombia UTC-5

// Copys por defecto si el mentor no ha definido la plantilla de esa ranura.
const DEFAULTS: Record<string, { title: string; body: string }> = {
  morning: { title: "Tu momento llegó", body: "30 segundos para elegir conscientemente tu día." },
  evening: { title: "Cierra tu día", body: "Marca tus hábitos y toma un momento para reflexionar." },
  coherence: { title: "Vuelve a ti", body: "La coherencia no es perfección, es volver. Hoy es un buen día para volver." },
  weekly: { title: "Cierra tu semana", body: "Evalúa tu semana y elige cómo empiezas la próxima." },
};
const VIEW_BY_TYPE: Record<string, string> = {
  push_morning: "calib", push_evening: "habitos", push_coherence: "home", push_weekly: "progreso",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET") || "";

    // ---- Auth: cron secret o admin JWT ----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    let authorized = false;
    if (cronSecret && token === cronSecret) authorized = true;
    if (!authorized) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const sbU = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await sbU.auth.getUser();
      if (user) {
        const sbA = createClient(supabaseUrl, serviceKey);
        const { data: p } = await sbA.from("profiles").select("role").eq("id", user.id).single();
        if (p?.role === "admin") authorized = true;
      }
    }
    if (!authorized) return json({ error: "Unauthorized" }, 401);

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    if (!vapidPublicKey || !vapidPrivateKey) return json({ error: "VAPID no configurado" }, 503);
    // Configurar UNA sola vez (antes se hacia por cada push individual, sumando latencia).
    webpush.setVapidDetails("mailto:hello@somosmaat.org", vapidPublicKey, vapidPrivateKey);

    const sb = createClient(supabaseUrl, serviceKey);

    // ---- Tiempo en marco Colombia ----
    const now = Date.now();
    const coNow = new Date(now - CO_OFFSET_MS);
    const coHour = coNow.getUTCHours();
    if (coHour >= 22 || coHour < 6) return json({ sent: 0, message: "quiet hours" }, 200);

    const todayStr = coNow.toISOString().slice(0, 10);
    const startToday = new Date(todayStr + "T00:00:00.000Z").getTime() + CO_OFFSET_MS; // medianoche CO en UTC
    const mon0 = (coNow.getUTCDay() + 6) % 7; // 0=Lun .. 6=Dom
    const isSunday = coNow.getUTCDay() === 0;
    const startWeek = startToday - mon0 * 86400000;
    const startTodayISO = new Date(startToday).toISOString();
    const startWeekISO = new Date(startWeek).toISOString();
    const dayKey = (ts: string) => new Date(new Date(ts).getTime() - CO_OFFSET_MS).toISOString().slice(0, 10);

    // ---- Plantillas activas por slot (texto editable) ----
    const { data: tpls } = await sb.from("notification_templates")
      .select("slot,title,body").eq("is_active", true).not("slot", "is", null);
    const copyOf = (slot: string) => {
      const t = (tpls || []).find((x) => x.slot === slot);
      return t && t.title && t.body ? { title: t.title, body: t.body } : DEFAULTS[slot];
    };

    // ---- Clientes candidatos para ESTA hora ----
    const { data: clients } = await sb.from("profiles")
      .select("id, notif_morning_hour, notif_evening_hour")
      .eq("role", "client").eq("active", true).eq("notif_enabled", true);
    const relevant = (clients || []).filter((c) =>
      (c.notif_morning_hour ?? 8) === coHour || (c.notif_evening_hour ?? 20) === coHour);
    if (relevant.length === 0) return json({ sent: 0, message: "Nadie en esta hora" }, 200);

    const ids = relevant.map((c) => c.id);

    // ---- Cargas en bloque (Regla 6 de espiritu: una sola pasada) ----
    const [subsR, calTR, habTR, logTR, calWR, habWR, logWR] = await Promise.all([
      sb.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth_key").in("user_id", ids),
      sb.from("calibrations").select("user_id,created_at").in("user_id", ids).gte("created_at", startTodayISO),
      sb.from("habit_tracker").select("user_id,updated_at").in("user_id", ids).gte("updated_at", startTodayISO),
      sb.from("notification_log").select("user_id,type,sent_at").in("user_id", ids).gte("sent_at", startTodayISO),
      sb.from("calibrations").select("user_id,created_at").in("user_id", ids).gte("created_at", startWeekISO),
      sb.from("habit_tracker").select("user_id,updated_at").in("user_id", ids).gte("updated_at", startWeekISO),
      sb.from("notification_log").select("user_id,sent_at").in("user_id", ids).gte("sent_at", startWeekISO),
    ]);
    const subsByUser = new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth_key: string }>>();
    for (const s of subsR.data || []) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
      subsByUser.get(s.user_id)!.push(s);
    }
    const calToday = new Set((calTR.data || []).map((r) => r.user_id));
    const habToday = new Set((habTR.data || []).map((r) => r.user_id));
    const typesToday = new Map<string, string[]>();
    for (const r of logTR.data || []) {
      if (!typesToday.has(r.user_id)) typesToday.set(r.user_id, []);
      typesToday.get(r.user_id)!.push(r.type);
    }
    // Dias-con-toque de la semana (calibracion, habito o push) por usuario
    const weekDays = new Map<string, Set<string>>();
    const addDay = (uid: string, ts: string) => {
      if (!weekDays.has(uid)) weekDays.set(uid, new Set());
      weekDays.get(uid)!.add(dayKey(ts));
    };
    for (const r of calWR.data || []) addDay(r.user_id, r.created_at);
    for (const r of habWR.data || []) addDay(r.user_id, r.updated_at);
    for (const r of logWR.data || []) addDay(r.user_id, r.sent_at);

    // ---- Decision por usuario: arma la cola de envios (todavia no envia nada) ----
    const nowISO = new Date(now).toISOString();
    const decisionByUser = new Map<string, string>();
    const payloadByType: Record<string, string> = {};
    const pending: Array<{ userId: string; type: string; sub: { id: string; endpoint: string; p256dh: string; auth_key: string } }> = [];

    for (const c of relevant) {
      const subs = subsByUser.get(c.id);
      if (!subs || subs.length === 0) continue;
      const tt = typesToday.get(c.id) || [];
      if (tt.length >= 2) continue; // cap diario

      const mh = c.notif_morning_hour ?? 8;
      const eh = c.notif_evening_hour ?? 20;
      let decision: { type: string; copy: { title: string; body: string } } | null = null;

      if (mh === coHour && !tt.includes("push_morning") && !calToday.has(c.id)) {
        decision = { type: "push_morning", copy: copyOf("morning") };
      } else if (eh === coHour && !tt.some((x) => x === "push_evening" || x === "push_coherence" || x === "push_weekly")) {
        if (isSunday) {
          decision = { type: "push_weekly", copy: copyOf("weekly") };
        } else {
          const touches = (weekDays.get(c.id) || new Set()).size;
          const daysLeftInclToday = 7 - mon0;
          const needed = 3 - touches;
          if (needed > 0 && needed >= daysLeftInclToday) {
            decision = { type: "push_coherence", copy: copyOf("coherence") };
          } else if (!habToday.has(c.id)) {
            decision = { type: "push_evening", copy: copyOf("evening") };
          }
        }
      }
      if (!decision) continue;

      decisionByUser.set(c.id, decision.type);
      if (!payloadByType[decision.type]) {
        payloadByType[decision.type] = JSON.stringify({
          title: decision.copy.title,
          body: decision.copy.body,
          icon: "https://www.somosmaat.org/app/icon-192.png",
          badge: "https://www.somosmaat.org/app/icon-192.png",
          data: { view: VIEW_BY_TYPE[decision.type] || "home" },
        });
      }
      for (const sub of subs) pending.push({ userId: c.id, type: decision.type, sub });
    }

    // ---- Enviar TODOS los push EN PARALELO ----
    // Antes se enviaba uno por uno (secuencial) y cada llamada recargaba la libreria
    // de push desde internet: con varios destinatarios reales superaba el timeout de
    // 5s de pg_net y el cron quedaba sin respuesta (status_code=null, cero log).
    const sentLog: Array<{ user_id: string; type: string; sent_at: string; days_absent: number | null }> = [];
    const expiredIds: string[] = [];
    let sentDevices = 0;

    if (pending.length > 0) {
      const results = await Promise.allSettled(
        pending.map((p) => sendWebPush({
          endpoint: p.sub.endpoint, p256dh: p.sub.p256dh, authKey: p.sub.auth_key,
          payload: payloadByType[p.type],
        }))
      );
      const okUsers = new Set<string>();
      results.forEach((r, i) => {
        const p = pending[i];
        if (r.status === "fulfilled") {
          if (r.value.ok) { sentDevices++; okUsers.add(p.userId); }
          else if (r.value.status === 410 || r.value.status === 404) expiredIds.push(p.sub.id);
        } else {
          console.error("push error:", r.reason);
        }
      });
      for (const userId of okUsers) {
        sentLog.push({ user_id: userId, type: decisionByUser.get(userId)!, sent_at: nowISO, days_absent: null });
      }
    }

    if (sentLog.length > 0) await sb.from("notification_log").insert(sentLog);
    if (expiredIds.length > 0) await sb.from("push_subscriptions").delete().in("id", expiredIds);

    return json({
      hour_co: coHour, users_notified: sentLog.length, devices: sentDevices, expired: expiredIds.length,
      message: `Ritual: ${sentLog.length} usuario(s), ${sentDevices} dispositivo(s)`,
    }, 200);
  } catch (err) {
    console.error("send-notifications error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// webpush ya viene importado y configurado (setVapidDetails) una sola vez arriba.
async function sendWebPush(opts: {
  endpoint: string; p256dh: string; authKey: string; payload: string;
}): Promise<Response> {
  const subscription = { endpoint: opts.endpoint, keys: { p256dh: opts.p256dh, auth: opts.authKey } };
  try {
    await webpush.sendNotification(subscription, opts.payload);
    return new Response("ok", { status: 201 });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string };
    return new Response(e.body || "Push failed", { status: e.statusCode || 500 });
  }
}
