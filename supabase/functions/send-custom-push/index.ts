// Edge Function: send-custom-push
// El mentor envia un push personalizado (titulo + mensaje) a TODOS sus clientes
// o a un GRUPO especifico. Pensado para mensajes dinamicos cuando quiera.
//
// Auth: JWT del mentor (verify-jwt ON, default). Valida propiedad del grupo.
// Body: { title, body, audience: 'all'|'group', group_id?, template_id? }
//
// Deploy: supabase functions deploy send-custom-push
//   (SIN --no-verify-jwt: queremos que el gateway valide el JWT del mentor)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ---- Identificar al mentor desde su JWT ----
    const authHeader = req.headers.get("Authorization") || "";
    const sbUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const b = await req.json().catch(() => ({}));
    const title: string = (b.title || "").toString().trim();
    const body: string = (b.body || "").toString().trim();
    const audience: string = b.audience === "group" ? "group" : "all";
    const groupId: string = b.group_id || "";
    const templateId: string = b.template_id || "";
    if (!title || !body) return json({ error: "Titulo y mensaje requeridos" }, 400);
    if (audience === "group" && !groupId) return json({ error: "Selecciona un grupo" }, 400);

    const sb = createClient(supabaseUrl, serviceKey);

    const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).single();
    const isAdmin = prof?.role === "admin";
    const isStaff = isAdmin || prof?.role === "mentor";
    if (!isStaff) return json({ error: "Solo mentores o admin" }, 403);

    // ---- Resolver destinatarios ----
    let recipientIds: string[] = [];
    if (audience === "group") {
      const { data: group } = await sb
        .from("mentor_groups").select("id, mentor_id").eq("id", groupId).single();
      if (!group) return json({ error: "Grupo no encontrado" }, 404);
      if (group.mentor_id !== user.id && !isAdmin)
        return json({ error: "No eres el mentor de este grupo" }, 403);
      const { data: mem } = await sb
        .from("mentor_group_members").select("client_id").eq("group_id", groupId).eq("active", true);
      recipientIds = (mem || []).map((m) => m.client_id);
    } else {
      // 'all': admin -> todos los clientes; mentor -> sus clientes asignados
      if (isAdmin) {
        const { data: clients } = await sb
          .from("profiles").select("id").eq("role", "client").eq("active", true);
        recipientIds = (clients || []).map((c) => c.id);
      } else {
        const { data: mc } = await sb
          .from("mentor_clients").select("client_id").eq("mentor_id", user.id)
          .or("active.eq.true,active.is.null");
        const ids = (mc || []).map((m) => m.client_id);
        if (ids.length) {
          const { data: act } = await sb
            .from("profiles").select("id").in("id", ids).eq("active", true);
          recipientIds = (act || []).map((c) => c.id);
        }
      }
    }
    if (recipientIds.length === 0)
      return json({ recipients: 0, sent: 0, message: "No hay destinatarios" }, 200);

    // ---- Suscripciones push ----
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", recipientIds);

    let sent = 0;
    let expired = 0;
    if (subs && subs.length > 0) {
      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
      if (!vapidPublicKey || !vapidPrivateKey) return json({ error: "VAPID no configurado" }, 503);

      const payload = JSON.stringify({
        title,
        body,
        icon: "https://www.somosmaat.org/app/icon-192.png",
        badge: "https://www.somosmaat.org/app/icon-192.png",
        data: { view: "home" },
      });

      const expiredIds: string[] = [];
      for (const sub of subs) {
        try {
          const r = await sendWebPush({
            endpoint: sub.endpoint, p256dh: sub.p256dh, authKey: sub.auth_key,
            payload, vapidPublicKey, vapidPrivateKey, vapidSubject: "mailto:hello@somosmaat.org",
          });
          if (r.ok) sent++;
          else if (r.status === 410 || r.status === 404) expiredIds.push(sub.id);
        } catch (e) { console.error("push error:", e); }
      }
      if (expiredIds.length > 0) {
        await sb.from("push_subscriptions").delete().in("id", expiredIds);
        expired = expiredIds.length;
      }

      const logs = recipientIds.map((uid) => ({
        user_id: uid, type: "push_custom", sent_at: new Date().toISOString(), days_absent: null as number | null,
      }));
      await sb.from("notification_log").insert(logs);
    }

    if (templateId) {
      await sb.from("notification_templates")
        .update({ last_sent_at: new Date().toISOString() }).eq("id", templateId);
    }

    return json({ recipients: recipientIds.length, sent, expired, message: `Enviado a ${sent} dispositivo(s)` }, 200);
  } catch (err) {
    console.error("send-custom-push error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendWebPush(opts: {
  endpoint: string; p256dh: string; authKey: string; payload: string;
  vapidPublicKey: string; vapidPrivateKey: string; vapidSubject: string;
}): Promise<Response> {
  const { default: webpush } = await import("https://esm.sh/web-push@3.6.7?target=deno");
  webpush.setVapidDetails(opts.vapidSubject, opts.vapidPublicKey, opts.vapidPrivateKey);
  const subscription = { endpoint: opts.endpoint, keys: { p256dh: opts.p256dh, auth: opts.authKey } };
  try {
    await webpush.sendNotification(subscription, opts.payload);
    return new Response("ok", { status: 201 });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string };
    return new Response(e.body || "Push failed", { status: e.statusCode || 500 });
  }
}
