// health-watch: vigilante del sistema de MAAT. Corre cada hora por pg_cron (ver sql/maat_system_health.sql).
//
// Mira una foto del sistema (tareas pg_cron, respuestas HTTP de esas tareas, push enviados),
// decide con core.ts si algo esta mal y, si es NUEVO (enfriamiento de 12 h por problema), lo guarda en
// system_alerts y avisa por correo. El panel (/panel/) lee system_alerts y la foto para mostrar la salud.
//
// Auth: CRON_SECRET (Authorization: Bearer ...). Desplegar SIEMPRE con --no-verify-jwt (ya esta en config.toml):
// con verify_jwt=true el gateway rechaza el CRON_SECRET con 401 (ver el fallo de septiembre en CLAUDE.md).
//
// Cuerpo opcional: {"dry":true}  -> devuelve la evaluacion sin guardar ni enviar nada.
//                  {"test":true} -> envia un correo de prueba a quien recibe las alertas.
// Correo: reutiliza los secretos SMTP_* de la funcion `testimonial`. Destino: HEALTH_NOTIFY_EMAIL,
// o TESTIMONIAL_NOTIFY_EMAIL, o SMTP_USERNAME.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { buildMail, evaluate, pickNew, type Issue, type Snapshot } from "./core.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function sendMail(to: string, m: { subject: string; html: string; text: string }): Promise<boolean> {
  const host = env("SMTP_HOST"), user = env("SMTP_USERNAME"), pass = env("SMTP_PASSWORD");
  if (!host || !user || !pass || !to) return false;
  const client = new SMTPClient({
    connection: {
      hostname: host, port: parseInt(env("SMTP_PORT", "465"), 10),
      tls: env("SMTP_SECURE", "true") === "true", auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({ from: env("SMTP_FROM", user), to, subject: m.subject, html: m.html, content: m.text });
    return true;
  } catch (e) {
    console.error("health-watch smtp:", e);
    return false;
  } finally {
    try { await client.close(); } catch { /* nada */ }
  }
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!sameSecret(token, env("CRON_SECRET"))) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { dry?: boolean; test?: boolean };
  const panel = env("HEALTH_PANEL_URL", "https://somosmaat.org/panel/");
  const to = env("HEALTH_NOTIFY_EMAIL", env("TESTIMONIAL_NOTIFY_EMAIL", env("SMTP_USERNAME")));

  try {
    if (body.test) {
      const test: Issue = { key: "test", kind: "test", text: "Esto es una prueba: el vigilante puede enviarte correos.", detail: {} };
      return json({ ok: true, test: true, emailed: await sendMail(to, buildMail([test], panel)) });
    }

    const { data, error } = await db.rpc("_system_health_raw");
    if (error) throw new Error(`snapshot: ${error.message}`);
    const snapshot = data as Snapshot;
    const issues = evaluate(snapshot);
    if (body.dry) return json({ ok: true, dry: true, issues, snapshot });

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: recent } = await db.from("system_alerts").select("kind,detail,created_at").gte("created_at", since);
    const fresh = pickNew(issues, recent ?? [], new Date());
    if (!fresh.length) return json({ ok: true, issues: issues.length, alerted: 0 });

    const emailed = await sendMail(to, buildMail(fresh, panel));
    const { error: insErr } = await db.from("system_alerts").insert(
      fresh.map((i) => ({ kind: i.kind, detail: { key: i.key, text: i.text, ...i.detail }, emailed })),
    );
    if (insErr) console.error("health-watch insert:", insErr.message);
    return json({ ok: true, issues: issues.length, alerted: fresh.length, emailed });
  } catch (e) {
    console.error("health-watch error:", e);
    return json({ error: "server_error" }, 500);
  }
});
