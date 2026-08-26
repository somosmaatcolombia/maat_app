// Edge Function: mentor-agent
// Agente conversacional del PORTAL DEL MENTOR. Recibe lo que el mentor escribe
// (o dicta por voz, ya transcrito en el navegador), decide que herramientas usar,
// las ejecuta contra la BD y responde en lenguaje natural.
//
// SEGURIDAD:
// - Solo mentor/admin. Todas las consultas usan el JWT del mentor, asi que las
//   policies RLS siguen aplicando: el agente no puede ver ni hacer nada que el
//   mentor no pudiera a mano.
// - maat_send_push NO envia salvo que llegue confirm:true. El agente tiene
//   instruccion de simular primero y pedir aprobacion; ademas la UI muestra una
//   tarjeta de confirmacion antes de permitir el envio real.
//
// Body: { messages: [{role, content}], confirm_token?: string }
// Respuesta: { reply, tool_trace: [...], pending_action?: {...} }
//
// Deploy: supabase functions deploy mentor-agent

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CO = 5 * 60 * 60 * 1000; // Colombia UTC-5
const MAX_STEPS = 6; // tope de vueltas del bucle de herramientas

/* ─────────────────────────── Utilidades ─────────────────────────── */

const coDay = (d: string | Date) =>
  new Date((typeof d === "string" ? new Date(d) : d).getTime() - CO).toISOString().slice(0, 10);

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const a = new Date(coDay(iso) + "T00:00:00Z").getTime();
  const b = new Date(coDay(new Date()) + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

function fmtCo(iso: string): string {
  const co = new Date(new Date(iso).getTime() - CO);
  const d = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  let h = co.getUTCHours();
  const mi = String(co.getUTCMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${d[co.getUTCDay()]} ${co.getUTCDate()} ${m[co.getUTCMonth()]}, ${h}:${mi} ${ap}`;
}

function coLocalToUtcIso(local: string): string {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Fecha invalida "${local}". Usa YYYY-MM-DDTHH:MM (hora Colombia).`);
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi) + CO).toISOString();
}

async function resolveClient(sb: SupabaseClient, needle: string) {
  const { data } = await sb
    .from("profiles").select("id, full_name, email, current_week, active, graduated").eq("role", "client");
  const list = data ?? [];
  const q = needle.trim().toLowerCase();
  const exact = list.find((c) => c.id === needle || c.email?.toLowerCase() === q);
  if (exact) return exact;
  const hits = list.filter((c) => c.full_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error(`No encontre a "${needle}". Usa listar_clientes para ver los nombres.`);
  throw new Error(`"${needle}" coincide con: ${hits.map((c) => c.full_name ?? c.email).join(", ")}. Se mas especifico.`);
}

/* ─────────────────────── Definicion de herramientas ─────────────────────── */

const TOOLS = [
  {
    type: "function",
    function: {
      name: "listar_clientes",
      description: "Panorama de los clientes: semana del proceso, estado y hace cuantos dias no aparecen.",
      parameters: {
        type: "object",
        properties: { incluir_inactivos: { type: "boolean", description: "Incluir suspendidos y graduados." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ficha_cliente",
      description: "Ficha de UN cliente: sus ultimos cierres de dia (que hizo, que le falto, que agradecio, que aprendio, su prioridad), coherencia y proxima sesion.",
      parameters: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nombre, email o id. Basta parte del nombre." },
          dias: { type: "number", description: "Ventana de dias. Por defecto 14." },
        },
        required: ["cliente"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clientes_en_riesgo",
      description: "Quien se esta enfriando: sin cerrar su dia ni abrir la app en N dias, o con coherencia baja.",
      parameters: {
        type: "object",
        properties: {
          dias_sin_actividad: { type: "number", description: "Umbral. Por defecto 3." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reporte_cohorte",
      description: "Estado general: activos, tasa de cierre, coherencia promedio y reparto por fase.",
      parameters: { type: "object", properties: { dias: { type: "number", description: "Ventana. Por defecto 7." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_sesiones",
      description: "Sesiones agendadas (proximas por defecto) con fecha en hora de Colombia.",
      parameters: {
        type: "object",
        properties: { alcance: { type: "string", enum: ["proximas", "pasadas"] } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_sesion",
      description: "Agenda una sesion 1:1 o grupal con recordatorios automaticos. La fecha se interpreta en hora de Colombia.",
      parameters: {
        type: "object",
        properties: {
          modalidad: { type: "string", enum: ["1on1", "group"] },
          cuando: { type: "string", description: "YYYY-MM-DDTHH:MM en hora Colombia. Ej 2026-08-27T19:00" },
          cliente: { type: "string", description: "Solo si modalidad=1on1." },
          grupo: { type: "string", description: "Solo si modalidad=group." },
          titulo: { type: "string" },
          lugar: { type: "string" },
        },
        required: ["modalidad", "cuando"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "brief_sesion",
      description: "Brief previo a una sesion: quien asiste, como llega cada uno y lo ultimo que escribio. Sin argumentos usa la proxima.",
      parameters: { type: "object", properties: { sesion_id: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_push",
      description:
        "Envia una notificacion push a los clientes. IMPORTANTE: por defecto SIMULA (no envia) y devuelve el alcance. " +
        "NUNCA pases confirmar:true por iniciativa propia: primero simula, muestra el resultado al mentor y espera que EL lo apruebe.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          mensaje: { type: "string" },
          audiencia: { type: "string", enum: ["all", "group"] },
          grupo: { type: "string" },
          confirmar: { type: "boolean", description: "Solo true si el mentor lo aprobo explicitamente en este chat." },
        },
        required: ["titulo", "mensaje"],
      },
    },
  },
];

/* ─────────────────────── Ejecucion de herramientas ─────────────────────── */

async function lastActivity(sb: SupabaseClient, ids: string[]) {
  const out = new Map<string, string>();
  const note = (id: string, ts: string) => {
    const p = out.get(id);
    if (!p || ts > p) out.set(id, ts);
  };
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [c, e] = await Promise.all([
    sb.from("calibrations").select("user_id, created_at").in("user_id", ids).gte("created_at", since),
    sb.from("usage_events").select("user_id, created_at").in("user_id", ids).eq("event", "app_open").gte("created_at", since),
  ]);
  for (const r of c.data ?? []) note(r.user_id, r.created_at);
  for (const r of e.data ?? []) note(r.user_id, r.created_at);
  return out;
}

async function runTool(
  sb: SupabaseClient, userId: string, role: string, name: string, args: Record<string, unknown>,
): Promise<{ text: string; pending?: unknown }> {
  switch (name) {
    case "listar_clientes": {
      const { data } = await sb
        .from("profiles").select("id, full_name, email, current_week, active, graduated")
        .eq("role", "client").order("full_name");
      let rows = data ?? [];
      if (!args.incluir_inactivos) rows = rows.filter((c) => c.active !== false && !c.graduated);
      if (!rows.length) return { text: "No hay clientes que coincidan." };
      const act = await lastActivity(sb, rows.map((c) => c.id));
      const lines = rows.map((c) => {
        const d = daysAgo(act.get(c.id) ?? null);
        const s = d === null ? "sin señal 30d" : d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d}d`;
        return `- ${c.full_name ?? c.email} · semana ${c.current_week ?? "?"}/16 · ${c.graduated ? "graduado" : c.active === false ? "suspendido" : "activo"} · visto ${s}`;
      });
      return { text: `${rows.length} cliente(s):\n${lines.join("\n")}` };
    }

    case "ficha_cliente": {
      const c = await resolveClient(sb, String(args.cliente));
      const dias = Number(args.dias ?? 14);
      const since = new Date(Date.now() - dias * 86_400_000).toISOString();
      const [cals, ses] = await Promise.all([
        sb.from("calibrations")
          .select("date, coherence, did_text, missing_text, gratitude_text, learning_text, tomorrow_priority, priority_done, created_at")
          .eq("user_id", c.id).gte("created_at", since).order("created_at", { ascending: false }),
        sb.from("mentor_sessions").select("scheduled_at, title").eq("client_id", c.id)
          .eq("status", "scheduled").gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(1),
      ]);
      const rows = cals.data ?? [];
      const cohs = rows.map((r) => r.coherence).filter((n): n is number => n != null);
      const avg = cohs.length ? (cohs.reduce((a, b) => a + b, 0) / cohs.length).toFixed(1) : "—";
      const det = rows.slice(0, 5).map((r) => {
        const b = [
          r.did_text && `hizo: ${r.did_text}`, r.missing_text && `falto: ${r.missing_text}`,
          r.gratitude_text && `agradecio: ${r.gratitude_text}`, r.learning_text && `aprendio: ${r.learning_text}`,
          r.tomorrow_priority && `prioridad: ${r.tomorrow_priority}`,
        ].filter(Boolean);
        return `  ${r.date} (coherencia ${r.coherence ?? "—"})${b.length ? " · " + b.join(" · ") : ""}`;
      });
      const next = (ses.data ?? [])[0];
      return {
        text: `${c.full_name ?? c.email} — semana ${c.current_week ?? "?"}/16\n` +
          `Cierres en ${dias}d: ${rows.length} · coherencia promedio ${avg}\n` +
          (next ? `Proxima sesion: ${fmtCo(next.scheduled_at)}\n` : "Sin sesion agendada.\n") +
          (det.length ? `Ultimos cierres:\n${det.join("\n")}` : "No ha cerrado ningun dia en la ventana."),
      };
    }

    case "clientes_en_riesgo": {
      const umbral = Number(args.dias_sin_actividad ?? 3);
      const { data } = await sb.from("profiles").select("id, full_name, email, current_week, active, graduated").eq("role", "client");
      const activos = (data ?? []).filter((c) => c.active !== false && !c.graduated);
      if (!activos.length) return { text: "No hay clientes activos." };
      const act = await lastActivity(sb, activos.map((c) => c.id));
      const riesgo = activos
        .map((c) => ({ c, d: daysAgo(act.get(c.id) ?? null) }))
        .filter((r) => r.d === null || r.d >= umbral)
        .sort((a, b) => (b.d ?? 99) - (a.d ?? 99));
      if (!riesgo.length) return { text: `Nadie lleva ${umbral}+ dias sin aparecer.` };
      return {
        text: `${riesgo.length} en riesgo:\n` + riesgo.map((r) =>
          `- ${r.c.full_name ?? r.c.email} (semana ${r.c.current_week ?? "?"}) — ${r.d === null ? "sin señal en 30d" : `${r.d} dias sin aparecer`}`).join("\n"),
      };
    }

    case "reporte_cohorte": {
      const dias = Number(args.dias ?? 7);
      const since = new Date(Date.now() - dias * 86_400_000).toISOString();
      const { data } = await sb.from("profiles").select("id, full_name, current_week, active, graduated").eq("role", "client");
      const activos = (data ?? []).filter((c) => c.active !== false && !c.graduated);
      if (!activos.length) return { text: "No hay clientes activos." };
      const { data: cals } = await sb.from("calibrations").select("user_id, coherence")
        .in("user_id", activos.map((c) => c.id)).gte("created_at", since);
      const cerraron = new Set((cals ?? []).map((r) => r.user_id));
      const cohs = (cals ?? []).map((r) => r.coherence).filter((n): n is number => n != null);
      const avg = cohs.length ? (cohs.reduce((a, b) => a + b, 0) / cohs.length).toFixed(1) : "—";
      const fase = (w: number | null) => (!w ? 0 : w <= 4 ? 1 : w <= 8 ? 2 : w <= 12 ? 3 : 4);
      const porFase = [1, 2, 3, 4].map((f) => `Fase ${f}: ${activos.filter((c) => fase(c.current_week) === f).length}`);
      const sinCerrar = activos.filter((c) => !cerraron.has(c.id));
      return {
        text: `Cohorte (ultimos ${dias}d): ${activos.length} activos · cerraron ${cerraron.size}/${activos.length} ` +
          `(${Math.round((cerraron.size / activos.length) * 100)}%) · coherencia ${avg}/10\n${porFase.join(" · ")}\n` +
          (sinCerrar.length ? `Sin cerrar: ${sinCerrar.map((c) => c.full_name).join(", ")}` : "Todos cerraron alguna vez."),
      };
    }

    case "listar_sesiones": {
      const pasadas = args.alcance === "pasadas";
      const now = new Date().toISOString();
      let q = sb.from("mentor_sessions")
        .select("id, modality, group_id, client_id, title, scheduled_at, location")
        .neq("status", "cancelled").limit(10);
      q = pasadas ? q.lt("scheduled_at", now).order("scheduled_at", { ascending: false })
                  : q.gte("scheduled_at", now).order("scheduled_at");
      const { data } = await q;
      if (!data?.length) return { text: pasadas ? "No hay sesiones pasadas." : "No hay sesiones agendadas." };
      const lines = await Promise.all(data.map(async (s) => {
        let dest = "?";
        if (s.modality === "group" && s.group_id) {
          const { data: g } = await sb.from("mentor_groups").select("name").eq("id", s.group_id).maybeSingle();
          dest = g?.name ?? "Grupo";
        } else if (s.client_id) {
          const { data: p } = await sb.from("profiles").select("full_name").eq("id", s.client_id).maybeSingle();
          dest = p?.full_name ?? "Cliente";
        }
        return `- [${s.id}] ${fmtCo(s.scheduled_at)} · ${s.modality === "group" ? "grupal" : "1:1"} · ${dest}${s.title ? ` — ${s.title}` : ""}`;
      }));
      return { text: lines.join("\n") };
    }

    case "agendar_sesion": {
      const scheduled = coLocalToUtcIso(String(args.cuando));
      if (new Date(scheduled).getTime() < Date.now()) {
        return { text: `Esa fecha ya paso (${fmtCo(scheduled)}). Propon una futura.` };
      }
      let clientId: string | null = null, groupId: string | null = null, dest = "";
      if (args.modalidad === "1on1") {
        if (!args.cliente) return { text: "Falta el cliente para una sesion 1:1." };
        const c = await resolveClient(sb, String(args.cliente));
        clientId = c.id; dest = c.full_name ?? c.email ?? "cliente";
      } else {
        if (!args.grupo) return { text: "Falta el grupo para una sesion grupal." };
        const { data: gs } = await sb.from("mentor_groups").select("id, name").eq("active", true);
        const q = String(args.grupo).toLowerCase();
        const hits = (gs ?? []).filter((g) => g.id === args.grupo || g.name?.toLowerCase().includes(q));
        if (hits.length !== 1) return { text: `Grupo ambiguo o inexistente. Activos: ${(gs ?? []).map((g) => g.name).join(", ") || "ninguno"}.` };
        groupId = hits[0].id; dest = hits[0].name;
      }
      const { data, error } = await sb.from("mentor_sessions").insert({
        mentor_id: userId, modality: args.modalidad, group_id: groupId, client_id: clientId,
        title: String(args.titulo ?? ""), scheduled_at: scheduled, duration_min: 60,
        location: String(args.lugar ?? ""), reminder_offsets: [1440, 60],
      }).select().single();
      if (error) return { text: `No pude agendar: ${error.message}` };
      return { text: `Agendada: ${args.modalidad === "group" ? "grupal" : "1:1"} con ${dest}, ${fmtCo(scheduled)}. Recordatorios 24h y 1h antes. (id ${data.id})` };
    }

    case "brief_sesion": {
      let ses;
      if (args.sesion_id) {
        const { data } = await sb.from("mentor_sessions").select("*").eq("id", String(args.sesion_id)).maybeSingle();
        ses = data;
      } else {
        const { data } = await sb.from("mentor_sessions").select("*").eq("status", "scheduled")
          .gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(1);
        ses = (data ?? [])[0];
      }
      if (!ses) return { text: "No hay sesiones proximas." };
      let ids: string[] = [];
      if (ses.modality === "group" && ses.group_id) {
        const { data: m } = await sb.from("mentor_group_members").select("client_id").eq("group_id", ses.group_id).eq("active", true);
        ids = (m ?? []).map((x) => x.client_id);
      } else if (ses.client_id) ids = [ses.client_id];
      if (!ids.length) return { text: `La sesion del ${fmtCo(ses.scheduled_at)} no tiene asistentes.` };
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const [profs, cals] = await Promise.all([
        sb.from("profiles").select("id, full_name, current_week").in("id", ids),
        sb.from("calibrations").select("user_id, coherence, learning_text, missing_text, tomorrow_priority, created_at")
          .in("user_id", ids).gte("created_at", since).order("created_at", { ascending: false }),
      ]);
      const by = new Map<string, any[]>();
      for (const r of cals.data ?? []) by.set(r.user_id, [...(by.get(r.user_id) ?? []), r]);
      const bloques = (profs.data ?? []).map((p) => {
        const rs = by.get(p.id) ?? [];
        const cohs = rs.map((r) => r.coherence).filter((n: any) => n != null);
        const avg = cohs.length ? (cohs.reduce((a: number, b: number) => a + b, 0) / cohs.length).toFixed(1) : "—";
        const u = rs[0];
        const d = u ? daysAgo(u.created_at) : null;
        return `${p.full_name} (semana ${p.current_week ?? "?"}) · coherencia ${avg} · ${d === null ? "sin cierres en 2 semanas" : d === 0 ? "cerro hoy" : `ultimo cierre hace ${d}d`}` +
          (u?.learning_text ? `\n   aprendio: ${u.learning_text}` : "") +
          (u?.missing_text ? `\n   le falto: ${u.missing_text}` : "") +
          (u?.tomorrow_priority ? `\n   su prioridad: ${u.tomorrow_priority}` : "");
      });
      return { text: `Sesion ${fmtCo(ses.scheduled_at)}${ses.title ? ` — ${ses.title}` : ""}\n\n${bloques.join("\n\n")}` };
    }

    case "enviar_push": {
      const audiencia = args.audiencia === "group" ? "group" : "all";
      let groupId: string | null = null, dest = "todos tus clientes activos";
      if (audiencia === "group") {
        if (!args.grupo) return { text: "Falta el grupo." };
        const { data: gs } = await sb.from("mentor_groups").select("id, name").eq("active", true);
        const q = String(args.grupo).toLowerCase();
        const hits = (gs ?? []).filter((g) => g.id === args.grupo || g.name?.toLowerCase().includes(q));
        if (hits.length !== 1) return { text: `Grupo ambiguo o inexistente.` };
        groupId = hits[0].id; dest = `el grupo "${hits[0].name}"`;
      }
      // Alcance real
      let ids: string[] = [];
      if (groupId) {
        const { data: m } = await sb.from("mentor_group_members").select("client_id").eq("group_id", groupId).eq("active", true);
        ids = (m ?? []).map((x) => x.client_id);
      } else if (role === "admin") {
        const { data } = await sb.from("profiles").select("id").eq("role", "client").eq("active", true);
        ids = (data ?? []).map((c) => c.id);
      } else {
        const { data: mc } = await sb.from("mentor_clients").select("client_id").eq("mentor_id", userId).or("active.eq.true,active.is.null");
        const asig = (mc ?? []).map((m) => m.client_id);
        if (asig.length) {
          const { data } = await sb.from("profiles").select("id").in("id", asig).eq("active", true);
          ids = (data ?? []).map((c) => c.id);
        }
      }
      let conPush = 0;
      if (ids.length) {
        const { data: subs } = await sb.from("push_subscriptions").select("user_id").in("user_id", ids);
        conPush = new Set((subs ?? []).map((s) => s.user_id)).size;
      }
      const titulo = String(args.titulo), mensaje = String(args.mensaje);

      if (!args.confirmar) {
        // SIMULACION: devuelve una accion pendiente para que la UI la confirme.
        return {
          text: `SIMULACION (no se envio). Destino: ${dest}. Alcance: ${ids.length} cliente(s), ${conPush} con notificaciones activas.\n` +
            `Titulo: ${titulo}\nMensaje: ${mensaje}\n` +
            `Dile al mentor que revise y confirme con el boton de la tarjeta.`,
          pending: { tipo: "push", titulo, mensaje, audiencia, grupo_id: groupId, destino: dest, alcance: ids.length, con_push: conPush },
        };
      }
      if (!conPush) return { text: `Nadie tiene notificaciones activas en ${dest}. No envie nada.` };
      return { text: `__EJECUTAR_PUSH__`, pending: { tipo: "push_confirmado", titulo, mensaje, audiencia, grupo_id: groupId } };
    }

    default:
      return { text: `Herramienta desconocida: ${name}` };
  }
}

/* ─────────────────────────── Handler ─────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Cliente con el JWT del mentor -> RLS aplica a todo lo que haga el agente.
    const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "No autenticado" }, 401);

    const sbAdmin = createClient(supabaseUrl, serviceKey);
    const { data: prof } = await sbAdmin.from("profiles").select("role, full_name").eq("id", user.id).single();
    if (!prof || !["mentor", "admin"].includes(prof.role)) {
      return json({ error: "Solo mentores o admin" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const incoming: Array<{ role: string; content: string }> = body.messages ?? [];
    if (!incoming.length) return json({ error: "Sin mensajes" }, 400);

    const { data: cfg } = await sbAdmin.from("ai_config").select("api_key").eq("id", 1).single();
    const apiKey = cfg?.api_key;
    if (!apiKey || apiKey === "sk-placeholder") {
      return json({ error: "Falta configurar la API key de IA en la tabla ai_config." }, 503);
    }

    const hoy = coDay(new Date());
    const system = {
      role: "system",
      content:
        `Eres el asistente operativo de ${prof.full_name ?? "el mentor"} en MAAT, una mentoria de 16 semanas. ` +
        `Hoy es ${hoy} (hora Colombia). ` +
        `Respondes en español, breve y concreto, como un colega que conoce el proceso. ` +
        `El ritual diario del cliente es NOCTURNO: cierra el dia (que hizo, que le falto, que agradece, ` +
        `termometro de coherencia 1-10, aprendizaje) y elige lo mas importante de manana; en la manana lee su ` +
        `statement y escucha su autohipnosis. ` +
        `Usa las herramientas para responder con datos reales, nunca inventes nombres ni cifras. ` +
        `Si te piden enviar un push: llama enviar_push SIN confirmar para simular, muestra el alcance y el texto, ` +
        `y deja que el mentor confirme con el boton. Jamas pongas confirmar:true por tu cuenta. ` +
        `Cuando el mentor dicte por voz el texto puede venir sin puntuacion: interpreta la intencion.`,
    };

    const messages: any[] = [system, ...incoming.map((m) => ({ role: m.role, content: m.content }))];
    const trace: Array<{ tool: string; args: unknown }> = [];
    let pendingAction: unknown = null;

    for (let step = 0; step < MAX_STEPS; step++) {
      const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "mistral-large-latest", messages, tools: TOOLS, tool_choice: "auto", temperature: 0.3 }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        console.error("Mistral error:", resp.status, t.slice(0, 300));
        return json({ error: `El modelo no respondio (HTTP ${resp.status}).` }, 502);
      }
      const out = await resp.json();
      const msg = out.choices?.[0]?.message;
      if (!msg) return json({ error: "Respuesta vacia del modelo." }, 502);

      const calls = msg.tool_calls ?? [];
      if (!calls.length) {
        return json({ reply: msg.content ?? "(sin respuesta)", tool_trace: trace, pending_action: pendingAction }, 200);
      }

      messages.push(msg);
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args vacios */ }
        trace.push({ tool: call.function.name, args });
        let result: { text: string; pending?: unknown };
        try {
          result = await runTool(sb, user.id, prof.role, call.function.name, args);
        } catch (e) {
          result = { text: `Error: ${e instanceof Error ? e.message : String(e)}` };
        }
        if (result.pending) pendingAction = result.pending;
        messages.push({
          role: "tool", tool_call_id: call.id, name: call.function.name, content: result.text,
        });
      }
    }

    return json({
      reply: "Me enrede dando demasiadas vueltas. Intenta pedirmelo de forma mas concreta.",
      tool_trace: trace, pending_action: pendingAction,
    }, 200);
  } catch (err) {
    console.error("mentor-agent error:", err);
    return json({ error: "Error interno del agente." }, 500);
  }
});

function json(b: unknown, status: number) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
