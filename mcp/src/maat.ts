/**
 * Cliente MAAT: sesion Supabase autenticada + helpers compartidos.
 *
 * SEGURIDAD: se autentica con las credenciales del MENTOR, no con service_role.
 * Asi las policies RLS siguen aplicando y el agente no puede hacer nada que el
 * mentor no pudiera hacer a mano en el portal.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.MAAT_SUPABASE_URL ?? "https://pcclptmojjzqmfmzftot.supabase.co";
// La anon key es publica (viaja en el HTML de la app); no es un secreto.
const SUPABASE_ANON_KEY =
  process.env.MAAT_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjY2xwdG1vamp6cW1mbXpmdG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTg3MjAsImV4cCI6MjA4NzQ3NDcyMH0.VuFBEy19fgNN5pSp_r8p2ZVViniunKdVW7Hy3AmqJXE";

/** Zona horaria de operacion de MAAT (Colombia, sin horario de verano). */
export const CO_OFFSET_MS = 5 * 60 * 60 * 1000;

let cached: SupabaseClient | null = null;
let cachedRole: string | null = null;

export class MaatError extends Error {}

/** Cliente autenticado como el mentor. Se autentica una vez y se reutiliza. */
export async function maat(): Promise<SupabaseClient> {
  if (cached) return cached;

  const email = process.env.MAAT_EMAIL;
  const password = process.env.MAAT_PASSWORD;
  if (!email || !password) {
    throw new MaatError(
      "Faltan credenciales. Define MAAT_EMAIL y MAAT_PASSWORD en la config del servidor MCP " +
        "(son las mismas con las que entras al portal del mentor).",
    );
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new MaatError(
      `No pude iniciar sesion como ${email}: ${error?.message ?? "credenciales invalidas"}. ` +
        "Verifica MAAT_EMAIL y MAAT_PASSWORD.",
    );
  }

  const { data: prof } = await client
    .from("profiles")
    .select("role, full_name")
    .eq("id", data.user.id)
    .single();

  if (!prof || !["mentor", "admin"].includes(prof.role)) {
    throw new MaatError(
      `La cuenta ${email} tiene rol "${prof?.role ?? "desconocido"}". ` +
        "Este servidor requiere una cuenta de mentor o admin.",
    );
  }

  cachedRole = prof.role;
  cached = client;
  return client;
}

/** Token de acceso vigente (para llamar Edge Functions con el JWT del mentor). */
export async function accessToken(): Promise<string> {
  const client = await maat();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new MaatError("Sesion sin token; reinicia el servidor MCP.");
  return token;
}

export function supabaseUrl(): string {
  return SUPABASE_URL;
}

export async function currentRole(): Promise<string> {
  await maat();
  return cachedRole ?? "mentor";
}

/* ─────────────────────── Fechas (marco Colombia) ─────────────────────── */

/** YYYY-MM-DD del dia colombiano de una fecha dada. */
export function coDay(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getTime() - CO_OFFSET_MS).toISOString().slice(0, 10);
}

/** Dias completos transcurridos desde una fecha hasta hoy (marco Colombia). */
export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(coDay(iso) + "T00:00:00Z").getTime();
  const today = new Date(coDay(new Date()) + "T00:00:00Z").getTime();
  return Math.round((today - then) / 86_400_000);
}

/** "2026-08-27T19:00" (hora Colombia) -> ISO UTC. */
export function coLocalToUtcIso(local: string): string {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (!m) {
    throw new MaatError(
      `Fecha invalida: "${local}". Usa el formato YYYY-MM-DDTHH:MM en hora de Colombia, ej "2026-08-27T19:00".`,
    );
  }
  const [, y, mo, d, h, mi] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  return new Date(asUtc + CO_OFFSET_MS).toISOString();
}

/** ISO UTC -> "mie 27 ago, 7:00 PM" en hora de Colombia. */
export function fmtCo(iso: string): string {
  const co = new Date(new Date(iso).getTime() - CO_OFFSET_MS);
  const days = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
  const mons = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  let h = co.getUTCHours();
  const mi = String(co.getUTCMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${days[co.getUTCDay()]} ${co.getUTCDate()} ${mons[co.getUTCMonth()]}, ${h}:${mi} ${ap}`;
}

/* ─────────────────────── Utilidades ─────────────────────── */

export type Client = {
  id: string;
  full_name: string | null;
  email: string | null;
  current_week: number | null;
  active: boolean | null;
  graduated: boolean | null;
};

/** Busca un cliente por UUID, email o parte del nombre. Error claro si es ambiguo. */
export async function resolveClient(needle: string): Promise<Client> {
  const sb = await maat();
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, email, current_week, active, graduated")
    .eq("role", "client");
  if (error) throw new MaatError(`No pude leer los clientes: ${error.message}`);

  const list = (data ?? []) as Client[];
  const q = needle.trim().toLowerCase();

  const exact = list.find((c) => c.id === needle || c.email?.toLowerCase() === q);
  if (exact) return exact;

  const matches = list.filter(
    (c) => c.full_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new MaatError(
      `No encontre ningun cliente que coincida con "${needle}". Usa maat_list_clients para ver los nombres disponibles.`,
    );
  }
  throw new MaatError(
    `"${needle}" coincide con varios clientes: ${matches
      .map((c) => c.full_name ?? c.email)
      .join(", ")}. Se mas especifico.`,
  );
}

/** Respuesta MCP: texto legible + datos estructurados. */
export function reply(text: string, data?: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    ...(data === undefined ? {} : { structuredContent: { data } }),
  };
}

/** Respuesta de error MCP (isError: el agente ve el mensaje y puede corregir). */
export function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
