// Edge Function: community-activity
// Notifica al DUENIO de un post cuando recibe reacciones en ComuniMAAT,
// AGRUPADAS (batch) para no mandar un push por cada reaccion.
//
// Flujo (una corrida cada ~3h):
// 1. Auth (cron secret o admin JWT).
// 2. Toma community_reactions con notified_at IS NULL.
// 3. Agrupa por dueno del post, excluye auto-reacciones.
// 4. Micro-tope: max 1 push/dia por dueno (type='push_community_activity').
// 5. Envia "A {nombre} y N personas mas les resono tu publicacion".
// 6. Marca notified_at en las reacciones ya avisadas (y en auto-reacciones/huerfanas).
//
// Deploy: supabase functions deploy community-activity
// Cron recomendado: "0 */3 * * *" (cada 3 horas). Auth: CRON_SECRET o admin JWT.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPush } from "../_shared/webpush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CO_OFFSET_MS = 5 * 60 * 60 * 1000; // Colombia UTC-5

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

    const sb = createClient(supabaseUrl, serviceKey);

    // ---- Reacciones pendientes de avisar ----
    const { data: reacts } = await sb.from("community_reactions")
      .select("id, post_id, user_id, created_at")
      .is("notified_at", null)
      .order("created_at", { ascending: true })
      .limit(500);
    if (!reacts || reacts.length === 0) return json({ sent: 0, message: "Sin reacciones nuevas" }, 200);

    // ---- Posts (dueno + titulo) ----
    const postIds = [...new Set(reacts.map((r) => r.post_id))];
    const { data: posts } = await sb.from("community_posts").select("id, user_id, title").in("id", postIds);
    const ownerByPost = new Map<string, { owner: string; title: string }>();
    for (const p of posts || []) ownerByPost.set(p.id, { owner: p.user_id, title: p.title });

    // ---- Agrupar por dueno; separar auto-reacciones y huerfanas para marcarlas ----
    type Agg = { reactionIds: string[]; reactors: Set<string>; lastReactor: string };
    const byOwner = new Map<string, Agg>();
    const markNow: string[] = []; // reacciones a marcar sin enviar (self / huerfanas)

    for (const r of reacts) {
      const info = ownerByPost.get(r.post_id);
      if (!info) { markNow.push(r.id); continue; }          // post borrado/oculto
      if (info.owner === r.user_id) { markNow.push(r.id); continue; } // auto-reaccion
      const a = byOwner.get(info.owner) || { reactionIds: [], reactors: new Set<string>(), lastReactor: r.user_id };
      a.reactionIds.push(r.id);
      a.reactors.add(r.user_id);
      a.lastReactor = r.user_id; // reacts vienen ASC -> el ultimo es el mas reciente
      byOwner.set(info.owner, a);
    }

    const ownerIds = [...byOwner.keys()];
    if (ownerIds.length === 0) {
      if (markNow.length) await sb.from("community_reactions").update({ notified_at: new Date().toISOString() }).in("id", markNow);
      return json({ sent: 0, message: "Solo auto-reacciones" }, 200);
    }

    // ---- Nombres (duenos + ultimos reactores), elegibilidad y micro-tope ----
    const reactorIds = [...new Set([...byOwner.values()].map((a) => a.lastReactor))];
    const [namesR, ownersR, subsR, capR] = await Promise.all([
      sb.from("profiles").select("id, full_name").in("id", [...new Set([...ownerIds, ...reactorIds])]),
      sb.from("profiles").select("id, active, notif_enabled").in("id", ownerIds),
      sb.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth_key").in("user_id", ownerIds),
      (() => {
        const coNow = new Date(Date.now() - CO_OFFSET_MS);
        const todayStr = coNow.toISOString().slice(0, 10);
        const startTodayISO = new Date(new Date(todayStr + "T00:00:00.000Z").getTime() + CO_OFFSET_MS).toISOString();
        return sb.from("notification_log").select("user_id").eq("type", "push_community_activity").in("user_id", ownerIds).gte("sent_at", startTodayISO);
      })(),
    ]);
    const nameById = new Map<string, string>();
    for (const n of namesR.data || []) nameById.set(n.id, n.full_name || "");
    const eligible = new Map<string, boolean>();
    for (const o of ownersR.data || []) eligible.set(o.id, o.active !== false && o.notif_enabled !== false);
    const subsByUser = new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth_key: string }>>();
    for (const s of subsR.data || []) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
      subsByUser.get(s.user_id)!.push(s);
    }
    const cappedToday = new Set((capR.data || []).map((r) => r.user_id));

    // ---- Enviar por dueno ----
    const sendJobs: Array<Promise<{ ok: boolean; status: number }>> = [];
    const jobSubId: string[] = [];
    const notifiedOwners: string[] = [];
    const reactionsToMark: string[] = [...markNow];

    for (const ownerId of ownerIds) {
      const agg = byOwner.get(ownerId)!;
      // Si esta capado hoy o no es elegible o no tiene push: dejar sus reacciones
      // sin marcar (se reintenta en la proxima corrida o cuando pase el tope).
      if (cappedToday.has(ownerId) || eligible.get(ownerId) === false) continue;
      const subs = subsByUser.get(ownerId);
      if (!subs || subs.length === 0) continue;

      const n = agg.reactors.size;
      const who = nameById.get(agg.lastReactor) || "Alguien";
      let body: string;
      if (n <= 1) body = `A ${who} le resono tu publicacion.`;
      else if (n === 2) body = `A ${who} y 1 persona mas les resono tu publicacion.`;
      else body = `A ${who} y ${n - 1} personas mas les resono tu publicacion.`;

      const payload = JSON.stringify({
        title: "Tu voz resuena",
        body,
        icon: "https://www.somosmaat.org/app/icon-192.png",
        badge: "https://www.somosmaat.org/app/icon-192.png",
        data: { view: "comunimaat" },
      });
      for (const sub of subs) {
        sendJobs.push(sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key }, payload));
        jobSubId.push(sub.id);
      }
      notifiedOwners.push(ownerId);
      reactionsToMark.push(...agg.reactionIds);
    }

    // ---- Ejecutar envios ----
    let sentDevices = 0;
    const expiredIds: string[] = [];
    if (sendJobs.length > 0) {
      const results = await Promise.allSettled(sendJobs);
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (r.value.ok) sentDevices++;
          else if (r.value.status === 410 || r.value.status === 404) expiredIds.push(jobSubId[i]);
        } else console.error("community push error:", r.reason);
      });
    }

    // ---- Persistencia: log, limpieza y marcado de reacciones ----
    const nowISO = new Date().toISOString();
    if (notifiedOwners.length > 0) {
      await sb.from("notification_log").insert(
        notifiedOwners.map((uid) => ({ user_id: uid, type: "push_community_activity", sent_at: nowISO, days_absent: null as number | null })),
      );
    }
    if (expiredIds.length > 0) await sb.from("push_subscriptions").delete().in("id", expiredIds);
    if (reactionsToMark.length > 0) {
      await sb.from("community_reactions").update({ notified_at: nowISO }).in("id", reactionsToMark);
    }

    return json({
      owners_notified: notifiedOwners.length,
      devices: sentDevices,
      reactions_marked: reactionsToMark.length,
      expired: expiredIds.length,
      message: `Comunidad: ${notifiedOwners.length} dueno(s) avisado(s)`,
    }, 200);
  } catch (err) {
    console.error("community-activity error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
