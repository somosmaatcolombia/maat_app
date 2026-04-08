// Edge Function: send-notifications
// Envía push notifications a usuarios inactivos
//
// Flujo:
// 1. Verifica Authorization (cron secret o admin JWT)
// 2. Consulta usuarios inactivos (2+ días sin calibrar, con suscripción push)
// 3. Filtra por notification_hour (hora preferida del usuario)
// 4. Envía Web Push a cada suscripción activa
// 5. Registra en notification_log
// 6. Limpia suscripciones inválidas (410 Gone)
//
// Deploy: supabase functions deploy send-notifications
// Cron: Configurar en Supabase Dashboard → Edge Functions → Cron
//        Schedule: "0 * * * *" (cada hora en punto)
//        O invocar manualmente: POST /functions/v1/send-notifications
//        con header Authorization: Bearer <CRON_SECRET>

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
    const cronSecret = Deno.env.get("CRON_SECRET") || "";

    // Verify authorization: either cron secret or admin JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    let authorized = false;

    // Check cron secret
    if (cronSecret && token === cronSecret) {
      authorized = true;
    }

    // Check admin JWT
    if (!authorized) {
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const sbUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sbUser.auth.getUser();
      if (user) {
        const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const { data: profile } = await sbAdmin
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profile?.role === "admin") authorized = true;
      }
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // Get current hour (UTC) — users store notification_hour in their local time
    // For Colombia (UTC-5), we adjust
    const now = new Date();
    const utcHour = now.getUTCHours();
    // Colombia offset: UTC-5
    const colombiaHour = (utcHour - 5 + 24) % 24;

    // Find users who:
    // 1. Have role = 'client' and active = true
    // 2. Have notification_hour matching current Colombia hour
    // 3. Have NOT calibrated in 2+ days
    // 4. Have at least one push subscription

    // Step 1: Get active clients with matching notification hour
    const { data: candidates, error: candErr } = await sb
      .from("profiles")
      .select("id, full_name, notification_hour")
      .eq("role", "client")
      .eq("notification_hour", colombiaHour);

    if (candErr) {
      console.error("Query profiles error:", candErr);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No users matching this hour" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const candidateIds = candidates.map((c) => c.id);

    // Step 2: Check who has calibrated in the last 2 days
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentCals } = await sb
      .from("calibrations")
      .select("user_id")
      .in("user_id", candidateIds)
      .gte("created_at", twoDaysAgo);

    const recentUserIds = new Set((recentCals || []).map((c) => c.user_id));
    const inactiveUsers = candidates.filter((c) => !recentUserIds.has(c.id));

    if (inactiveUsers.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "All users are active" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inactiveIds = inactiveUsers.map((u) => u.id);

    // Step 3: Check who was already notified today (avoid spam)
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayLogs } = await sb
      .from("notification_log")
      .select("user_id")
      .in("user_id", inactiveIds)
      .eq("type", "push_inactive")
      .gte("sent_at", todayStart.toISOString());

    const alreadyNotified = new Set((todayLogs || []).map((l) => l.user_id));
    const toNotify = inactiveUsers.filter((u) => !alreadyNotified.has(u.id));

    if (toNotify.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "All inactive users already notified today" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Get push subscriptions for these users
    const toNotifyIds = toNotify.map((u) => u.id);
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", toNotifyIds);

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No push subscriptions found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 5: Send Web Push notifications
    // We need the VAPID keys for signing
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Import web-push library for Deno
    // Note: Using raw fetch with VAPID JWT signing
    const sent: string[] = [];
    const failed: string[] = [];
    const expired: string[] = [];

    for (const sub of subs) {
      const userInfo = toNotify.find((u) => u.id === sub.user_id);
      const daysSince = await getDaysSinceCalib(sb, sub.user_id);

      const payload = JSON.stringify({
        title: "MAAT — Tu calibración te espera",
        body: daysSince
          ? `Llevas ${daysSince} días sin calibrar. 5 minutos pueden cambiar tu día.`
          : "Es momento de calibrar. 5 minutos de reflexión genuina.",
        icon: "https://somosmaat.org/wp-content/uploads/2026/02/logo_app.png",
        badge: "https://somosmaat.org/wp-content/uploads/2026/02/logo_app.png",
        data: { view: "calib" },
      });

      try {
        // Build Web Push request with VAPID
        const pushResult = await sendWebPush({
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          authKey: sub.auth_key,
          payload,
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject: "mailto:hello@somosmaat.org",
        });

        if (pushResult.ok) {
          sent.push(sub.user_id);
        } else if (pushResult.status === 410 || pushResult.status === 404) {
          // Subscription expired — clean up
          expired.push(sub.id);
        } else {
          failed.push(sub.user_id);
          console.error(
            `Push failed for ${sub.user_id}: ${pushResult.status} ${await pushResult.text()}`
          );
        }
      } catch (e) {
        failed.push(sub.user_id);
        console.error(`Push error for ${sub.user_id}:`, e);
      }
    }

    // Step 6: Log notifications
    const uniqueSent = [...new Set(sent)];
    if (uniqueSent.length > 0) {
      const logs = uniqueSent.map((userId) => ({
        user_id: userId,
        type: "push_inactive",
        sent_at: now.toISOString(),
        days_absent: null as number | null,
      }));

      // Enrich with days_absent
      for (const log of logs) {
        log.days_absent = await getDaysSinceCalib(sb, log.user_id);
      }

      await sb.from("notification_log").insert(logs);
    }

    // Step 7: Clean up expired subscriptions
    if (expired.length > 0) {
      await sb.from("push_subscriptions").delete().in("id", expired);
      console.log(`Cleaned up ${expired.length} expired push subscriptions`);
    }

    return new Response(
      JSON.stringify({
        sent: uniqueSent.length,
        failed: failed.length,
        expired: expired.length,
        message: `Notified ${uniqueSent.length} users`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-notifications error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: Get days since last calibration
async function getDaysSinceCalib(
  sb: ReturnType<typeof createClient>,
  userId: string
): Promise<number | null> {
  const { data } = await sb
    .from("calibrations")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  const lastDate = new Date(data[0].created_at);
  return Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
}

// Helper: Send Web Push using raw fetch + VAPID JWT
// This avoids needing a full web-push npm library in Deno
async function sendWebPush(opts: {
  endpoint: string;
  p256dh: string;
  authKey: string;
  payload: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}): Promise<Response> {
  // For a production-grade implementation, you'd use the web-push protocol
  // with ECDH key exchange and content encryption.
  // For now, we use a simplified approach via a Deno-compatible library.

  // Import webpush utilities
  const { default: webpush } = await import(
    "https://esm.sh/web-push@3.6.7?target=deno"
  );

  webpush.setVapidDetails(
    opts.vapidSubject,
    opts.vapidPublicKey,
    opts.vapidPrivateKey
  );

  const subscription = {
    endpoint: opts.endpoint,
    keys: {
      p256dh: opts.p256dh,
      auth: opts.authKey,
    },
  };

  try {
    await webpush.sendNotification(subscription, opts.payload);
    return new Response("ok", { status: 201 });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; body?: string };
    // Return a Response-like object for status checking
    return new Response(error.body || "Push failed", {
      status: error.statusCode || 500,
    });
  }
}
