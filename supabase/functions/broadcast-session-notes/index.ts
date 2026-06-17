// Edge Function: broadcast-session-notes
// El mentor escribe notas + tareas de UNA sesion grupal y se guardan para
// TODOS los miembros activos del grupo (una fila session_notes por miembro).
// Opcionalmente envia push a todos para avisarles.
//
// Auth: JWT del mentor (verify-jwt ON, default). Se valida que el mentor sea
//   duenno del grupo antes de escribir nada.
// Body: { group_id, session_date?, notes?, next_plan?, notify? }
//
// Deploy: supabase functions deploy broadcast-session-notes
//   (SIN --no-verify-jwt: queremos que el gateway valide el JWT del mentor)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ---- Identificar al mentor desde su JWT ----
    const authHeader = req.headers.get("Authorization") || "";
    const sbUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const groupId: string = body.group_id || "";
    const notes: string = (body.notes || "").toString().trim();
    const nextPlan: string = (body.next_plan || "").toString().trim();
    const sessionDate: string = body.session_date || new Date().toISOString().slice(0, 10);
    const notify: boolean = body.notify !== false; // default: avisar

    if (!groupId) return json({ error: "group_id requerido" }, 400);
    if (!notes && !nextPlan) return json({ error: "Escribe notas o tareas" }, 400);

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // ---- Validar propiedad del grupo ----
    const { data: group } = await sb
      .from("mentor_groups")
      .select("id, mentor_id, name")
      .eq("id", groupId)
      .single();
    if (!group) return json({ error: "Grupo no encontrado" }, 404);

    let isAdmin = false;
    if (group.mentor_id !== user.id) {
      const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).single();
      isAdmin = prof?.role === "admin";
      if (!isAdmin) return json({ error: "No eres el mentor de este grupo" }, 403);
    }

    // ---- Miembros activos + su semana actual ----
    const { data: members } = await sb
      .from("mentor_group_members")
      .select("client_id")
      .eq("group_id", groupId)
      .eq("active", true);
    const memberIds = (members || []).map((m) => m.client_id);
    if (memberIds.length === 0) {
      return json({ inserted: 0, sent: 0, message: "El grupo no tiene miembros activos" }, 200);
    }

    const { data: profs } = await sb
      .from("profiles").select("id, current_week").in("id", memberIds);
    const weekOf: Record<string, number | null> = {};
    (profs || []).forEach((p) => { weekOf[p.id] = p.current_week ?? null; });

    // ---- Insertar una nota por miembro ----
    const rows = memberIds.map((cid) => ({
      mentor_id: group.mentor_id,
      client_id: cid,
      group_id: groupId,
      session_type: "group",
      session_date: sessionDate,
      notes,
      next_plan: nextPlan,
      client_week: weekOf[cid] ?? null,
    }));
    const { data: inserted, error: insErr } = await sb
      .from("session_notes").insert(rows).select("id");
    if (insErr) {
      console.error("insert session_notes error:", insErr);
      return json({ error: "No se pudieron guardar las notas" }, 500);
    }

    // ---- Push opcional a los miembros ----
    let sent = 0;
    let expired = 0;
    if (notify) {
      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
      if (vapidPublicKey && vapidPrivateKey) {
        const { data: subs } = await sb
          .from("push_subscriptions")
          .select("id, user_id, endpoint, p256dh, auth_key")
          .in("user_id", memberIds);

        const payload = JSON.stringify({
          title: "Notas de tu sesion de mentoria",
          body: nextPlan
            ? "Tu mentor compartio las conclusiones y una tarea para ti."
            : "Tu mentor compartio las conclusiones de la sesion.",
          icon: "https://www.somosmaat.org/wp-content/uploads/2026/02/logo_app.png",
          badge: "https://www.somosmaat.org/wp-content/uploads/2026/02/logo_app.png",
          data: { view: "mentor-notes" },
        });

        const expiredIds: string[] = [];
        for (const sub of subs || []) {
          try {
            const r = await sendWebPush({
              endpoint: sub.endpoint,
              p256dh: sub.p256dh,
              authKey: sub.auth_key,
              payload,
              vapidPublicKey,
              vapidPrivateKey,
              vapidSubject: "mailto:hello@somosmaat.org",
            });
            if (r.ok) sent++;
            else if (r.status === 410 || r.status === 404) expiredIds.push(sub.id);
          } catch (e) {
            console.error("push error:", e);
          }
        }
        if (expiredIds.length > 0) {
          await sb.from("push_subscriptions").delete().in("id", expiredIds);
          expired = expiredIds.length;
        }
      }
    }

    return json({
      inserted: (inserted || []).length,
      sent,
      expired,
      group: group.name,
      message: `Notas guardadas para ${(inserted || []).length} miembro(s)`,
    }, 200);
  } catch (err) {
    console.error("broadcast-session-notes error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Envia Web Push (igual patron que send-notifications / session-reminders).
async function sendWebPush(opts: {
  endpoint: string;
  p256dh: string;
  authKey: string;
  payload: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}): Promise<Response> {
  const { default: webpush } = await import(
    "https://esm.sh/web-push@3.6.7?target=deno"
  );
  webpush.setVapidDetails(opts.vapidSubject, opts.vapidPublicKey, opts.vapidPrivateKey);
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
