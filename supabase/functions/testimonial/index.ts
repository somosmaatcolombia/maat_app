// Edge Function: testimonial
// Puerta de entrada del modulo de testimonios autogestionados (web somosmaat.org/es/testimonios/).
// Recibe lo que escribe quien hizo el proceso (foto pequena, profesion u oficio, de donde es,
// su experiencia), lo valida, sube la foto y lo guarda como PENDIENTE. Nada se publica hasta que
// mentor/admin lo aprueban en el panel de feedback (/feedback-panel/).
//
// Por que una funcion y no un insert directo desde la pagina:
//   * El visitante no tiene cuenta: abrir el insert/el almacenamiento a `anon` permitiria
//     que cualquiera suba archivos o llene la tabla. Aqui se valida TODO en el servidor
//     (tipo real de imagen por sus bytes, tamano, enlaces, limite por IP, trampa anti-bots).
//   * El correo y el enlace privado nunca pasan por el RLS publico.
//
// Contrato (POST JSON). Respuesta siempre JSON; errores {error, fields?}:
//   submit   {name,email,role,location,quote,lang,consent:true,photo?:dataURL,
//             manage_base?,elapsed_ms,website?}      -> {ok, manage_url, emailed}
//   get      {op:"get", token}                       -> {ok, status, data}
//   update   {op:"update", token, ...campos, photo?, remove_photo?}  -> {ok, status:"pending"}
//   withdraw {op:"withdraw", token}                  -> {ok, status:"withdrawn"}
//
// Autogestion: cada envio devuelve un enlace privado (?edit=TOKEN). Solo se guarda el hash del token.
// Cualquier edicion vuelve a revision; retirar es inmediato.
//
// Conexion con el modulo de feedback: el correo se cruza con profiles.email (matched_user_id) para que
// el panel muestre la satisfaccion y el NPS del cliente junto a su testimonio.
//
// Auth: publica (visitantes sin cuenta). Deploy SIN verificacion de JWT (tambien en config.toml):
//   supabase link --project-ref pcclptmojjzqmfmzftot
//   supabase functions deploy testimonial --no-verify-jwt
//
// Secrets (supabase secrets set ...). Todos opcionales salvo que quieras correos:
//   TESTIMONIAL_ORIGINS       dominios permitidos para el enlace de gestion, separados por coma
//                             (default: https://somosmaat.org,https://v2.somosmaat.org)
//   TESTIMONIAL_SALT          sal para el hash de IP (default fija; mejor poner una propia)
//   TESTIMONIAL_NOTIFY_EMAIL  buzon que recibe el aviso de "nuevo testimonio" (default: SMTP_USERNAME)
//   TESTIMONIAL_PANEL_URL     enlace del panel en el aviso (default: https://somosmaat.org/feedback-panel/)
//   SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD / SMTP_FROM / SMTP_SECURE  (los mismos de
//   send-biotipo-result). Sin SMTP el testimonio se guarda igual; solo no hay correos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { handle, type Deps, type Row } from "./core.ts";
import { personMail, staffMail, type Mail } from "./mail.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const SUPABASE_URL = env("SUPABASE_URL");
const db = createClient(SUPABASE_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const BUCKET = "testimonial-photos";
const COLS = "id,status,lang,name,email,role,location,quote,photo_path,created_at,published_at,matched_user_id";

async function sendMail(to: string, m: Mail): Promise<boolean> {
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
    console.error("testimonial smtp:", e);
    return false;
  } finally {
    try { await client.close(); } catch { /* nada */ }
  }
}

const deps: Deps = {
  now: () => new Date(),
  randomId: () => crypto.randomUUID(),
  supabaseUrl: SUPABASE_URL,
  allowedOrigins: env("TESTIMONIAL_ORIGINS", "https://somosmaat.org,https://v2.somosmaat.org")
    .split(",").map((s) => s.trim()).filter(Boolean),
  ipSalt: env("TESTIMONIAL_SALT", "maat-testimonials"),

  async insertRow(row) {
    const { error } = await db.from("testimonials").insert(row);
    if (error) console.error("testimonial insert:", error.message);
    return error ? { error: error.message } : {};
  },
  async updateRow(id, patch) {
    const { error } = await db.from("testimonials").update(patch).eq("id", id);
    if (error) console.error("testimonial update:", error.message);
    return error ? { error: error.message } : {};
  },
  async findByTokenHash(hash) {
    const { data } = await db.from("testimonials").select(COLS).eq("manage_token_hash", hash).maybeSingle();
    return (data as Row | null) ?? null;
  },
  async countRecentByIp(ipHash, sinceIso) {
    const { count } = await db.from("testimonials").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("created_at", sinceIso);
    return count ?? 0;
  },
  async matchProfile(email) {
    const { data } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  },
  async uploadPhoto(path, bytes, mime) {
    // Cache corta a proposito: el nombre es unico asi que no hace falta una larga, y asi una foto retirada
    // deja de servirse desde el CDN en minutos (con 1 ano seguia sirviendose despues de borrarla).
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime, upsert: false, cacheControl: "300",
    });
    if (error) console.error("testimonial upload:", error.message);
    return error ? { error: error.message } : {};
  },
  async deletePhoto(path) {
    const { error } = await db.storage.from(BUCKET).remove([path]);
    if (error) console.error("testimonial delete photo:", error.message);
  },
  async notify({ kind, row, manageUrl }) {
    const panel = env("TESTIMONIAL_PANEL_URL", "https://somosmaat.org/feedback-panel/");
    const staffTo = env("TESTIMONIAL_NOTIFY_EMAIL", env("SMTP_USERNAME"));
    await sendMail(staffTo, staffMail(kind, row, panel));
    const emailedPerson = kind === "new" && manageUrl
      ? await sendMail(row.email, personMail(row.lang, row.name, manageUrl))
      : false;
    return { emailedPerson };
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "bad_json" }, 400);

  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown")
    .split(",")[0].trim();
  try {
    const out = await handle(body as Record<string, unknown>, ip, deps);
    return json(out.body, out.status);
  } catch (e) {
    console.error("testimonial error:", e);
    return json({ error: "server_error" }, 500);
  }
});
