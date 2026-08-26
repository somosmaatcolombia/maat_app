/** Seguimiento de clientes: panorama, ficha individual y deteccion de riesgo. */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maat, resolveClient, reply, fail, daysAgo, fmtCo, MaatError } from "../maat.js";

/** Ultima señal de vida por cliente: cierre de dia o apertura de la app. */
async function lastActivity(ids: string[]): Promise<Map<string, string>> {
  const sb = await maat();
  const out = new Map<string, string>();
  const note = (id: string, ts: string) => {
    const prev = out.get(id);
    if (!prev || ts > prev) out.set(id, ts);
  };
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [cal, ev] = await Promise.all([
    sb.from("calibrations").select("user_id, created_at").in("user_id", ids).gte("created_at", since),
    sb.from("usage_events").select("user_id, created_at").in("user_id", ids).eq("event", "app_open").gte("created_at", since),
  ]);
  for (const r of cal.data ?? []) note(r.user_id, r.created_at);
  for (const r of ev.data ?? []) note(r.user_id, r.created_at);
  return out;
}

export function registerClientes(server: McpServer) {
  server.registerTool(
    "maat_list_clients",
    {
      title: "Listar clientes",
      description:
        "Panorama de todos los clientes de la mentoria: semana del proceso, si estan activos o suspendidos, " +
        "y hace cuantos dias se les vio por ultima vez (cierre de dia o apertura de la app). " +
        "Es el punto de partida para cualquier seguimiento.",
      inputSchema: {
        include_inactive: z
          .boolean()
          .optional()
          .describe("Incluir suspendidos y graduados. Por defecto false (solo activos en proceso)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ include_inactive }) => {
      try {
        const sb = await maat();
        const { data, error } = await sb
          .from("profiles")
          .select("id, full_name, email, current_week, active, graduated, suspended_at")
          .eq("role", "client")
          .order("full_name");
        if (error) return fail(`No pude leer los clientes: ${error.message}`);

        let rows = data ?? [];
        if (!include_inactive) rows = rows.filter((c) => c.active !== false && !c.graduated);
        if (rows.length === 0) return reply("No hay clientes que coincidan.", []);

        const act = await lastActivity(rows.map((c) => c.id));
        const enriched = rows.map((c) => {
          const last = act.get(c.id) ?? null;
          return {
            id: c.id,
            nombre: c.full_name ?? "(sin nombre)",
            email: c.email,
            semana: c.current_week ?? null,
            dias_sin_actividad: daysAgo(last),
            estado: c.graduated ? "graduado" : c.active === false ? "suspendido" : "activo",
          };
        });

        const lines = enriched.map((c) => {
          const d = c.dias_sin_actividad;
          const señal = d === null ? "sin señal en 30d" : d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d}d`;
          const flag = d !== null && d >= 3 ? "  ⚠" : "";
          return `- ${c.nombre} — semana ${c.semana ?? "?"}/16 · ${c.estado} · visto ${señal}${flag}`;
        });
        return reply(
          `${enriched.length} cliente(s):\n${lines.join("\n")}`,
          enriched,
        );
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );

  server.registerTool(
    "maat_get_client",
    {
      title: "Ficha de un cliente",
      description:
        "Ficha completa de UN cliente: progreso, sus ultimos cierres de dia (que hizo, que le falto, que agradecio, " +
        "que aprendio, su prioridad y si la cumplio), coherencia reciente y su proxima sesion. " +
        "Usalo antes de una sesion o cuando quieras entender como esta alguien.",
      inputSchema: {
        client: z.string().describe("Nombre, email o id del cliente. Basta parte del nombre."),
        days: z.number().int().min(1).max(60).optional().describe("Cuantos dias de cierres traer. Por defecto 14."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ client, days }) => {
      try {
        const sb = await maat();
        const c = await resolveClient(client);
        const window = days ?? 14;
        const since = new Date(Date.now() - window * 86_400_000).toISOString();

        const [cals, sesiones, fb] = await Promise.all([
          sb.from("calibrations")
            .select("date, week, coherence, did_text, missing_text, gratitude_text, learning_text, tomorrow_priority, priority_done, created_at")
            .eq("user_id", c.id).gte("created_at", since).order("created_at", { ascending: false }),
          sb.from("mentor_sessions")
            .select("id, modality, title, scheduled_at, location, status")
            .eq("client_id", c.id).eq("status", "scheduled")
            .gte("scheduled_at", new Date().toISOString())
            .order("scheduled_at").limit(1),
          sb.from("client_feedback").select("moment, satisfaccion, nps").eq("user_id", c.id),
        ]);

        const closes = cals.data ?? [];
        const cohs = closes.map((r) => r.coherence).filter((n): n is number => n != null);
        const avg = cohs.length ? (cohs.reduce((a, b) => a + b, 0) / cohs.length).toFixed(1) : "—";

        const detalle = closes.slice(0, 7).map((r) => {
          const bits = [
            r.did_text && `hizo: ${r.did_text}`,
            r.missing_text && `falto: ${r.missing_text}`,
            r.gratitude_text && `agradecio: ${r.gratitude_text}`,
            r.learning_text && `aprendio: ${r.learning_text}`,
            r.tomorrow_priority && `prioridad: ${r.tomorrow_priority}`,
            r.priority_done && `cumplio anterior: ${r.priority_done}`,
          ].filter(Boolean);
          return `  · ${r.date ?? "?"} (coherencia ${r.coherence ?? "—"})${bits.length ? "\n      " + bits.join("\n      ") : ""}`;
        });

        const next = (sesiones.data ?? [])[0];
        const momentos = (fb.data ?? []).map((f) => f.moment);

        const text = [
          `**${c.full_name ?? c.email}** — semana ${c.current_week ?? "?"}/16 · ${c.graduated ? "graduado" : c.active === false ? "suspendido" : "activo"}`,
          `Cierres en los ultimos ${window} dias: ${closes.length} · coherencia promedio: ${avg}`,
          next ? `Proxima sesion: ${fmtCo(next.scheduled_at)}${next.title ? ` — ${next.title}` : ""}` : "Sin sesion agendada.",
          momentos.length ? `Feedback entregado: ${momentos.join(", ")}` : "Sin feedback de trazabilidad todavia.",
          closes.length ? `\nUltimos cierres:\n${detalle.join("\n")}` : "\nNo ha cerrado ningun dia en esta ventana.",
        ].join("\n");

        return reply(text, {
          cliente: { id: c.id, nombre: c.full_name, semana: c.current_week },
          coherencia_promedio: avg,
          cierres: closes,
          proxima_sesion: next ?? null,
          feedback_momentos: momentos,
        });
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );

  server.registerTool(
    "maat_find_at_risk",
    {
      title: "Clientes en riesgo",
      description:
        "Detecta quien se esta enfriando: clientes activos sin señal de vida (ni cierre de dia ni apertura de la app) " +
        "durante N dias, o con coherencia baja sostenida. Devuelve el motivo de cada alerta para que puedas " +
        "escribirles con contexto.",
      inputSchema: {
        days_inactive: z.number().int().min(1).max(30).optional().describe("Umbral de dias sin actividad. Por defecto 3."),
        low_coherence: z.number().int().min(1).max(10).optional().describe("Marcar si su coherencia promedio de 7 dias esta por debajo de esto. Por defecto 4."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ days_inactive, low_coherence }) => {
      try {
        const sb = await maat();
        const umbral = days_inactive ?? 3;
        const umbralCoh = low_coherence ?? 4;

        const { data, error } = await sb
          .from("profiles")
          .select("id, full_name, email, current_week, active, graduated")
          .eq("role", "client");
        if (error) return fail(`No pude leer los clientes: ${error.message}`);

        const activos = (data ?? []).filter((c) => c.active !== false && !c.graduated);
        if (activos.length === 0) return reply("No hay clientes activos.", []);

        const ids = activos.map((c) => c.id);
        const act = await lastActivity(ids);
        const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const { data: cals } = await sb
          .from("calibrations").select("user_id, coherence").in("user_id", ids).gte("created_at", since7);

        const cohByUser = new Map<string, number[]>();
        for (const r of cals ?? []) {
          if (r.coherence == null) continue;
          cohByUser.set(r.user_id, [...(cohByUser.get(r.user_id) ?? []), r.coherence]);
        }

        const riesgo = activos
          .map((c) => {
            const d = daysAgo(act.get(c.id) ?? null);
            const cohs = cohByUser.get(c.id) ?? [];
            const avg = cohs.length ? cohs.reduce((a, b) => a + b, 0) / cohs.length : null;
            const motivos: string[] = [];
            if (d === null) motivos.push("sin señal en 30 dias");
            else if (d >= umbral) motivos.push(`${d} dias sin aparecer`);
            if (avg !== null && avg < umbralCoh) motivos.push(`coherencia baja (${avg.toFixed(1)}/10)`);
            return { c, d, avg, motivos };
          })
          .filter((r) => r.motivos.length > 0)
          .sort((a, b) => (b.d ?? 99) - (a.d ?? 99));

        if (riesgo.length === 0) {
          return reply(`Nadie en riesgo: todos los clientes activos aparecieron en los ultimos ${umbral} dias.`, []);
        }

        const lines = riesgo.map(
          (r) => `- ${r.c.full_name ?? r.c.email} (semana ${r.c.current_week ?? "?"}) — ${r.motivos.join(" · ")}`,
        );
        return reply(
          `${riesgo.length} cliente(s) en riesgo:\n${lines.join("\n")}`,
          riesgo.map((r) => ({
            id: r.c.id,
            nombre: r.c.full_name,
            semana: r.c.current_week,
            dias_sin_actividad: r.d,
            coherencia_7d: r.avg,
            motivos: r.motivos,
          })),
        );
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );
}
