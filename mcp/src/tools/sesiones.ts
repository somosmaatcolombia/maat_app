/** Sesiones de mentoria: ver agenda, agendar y preparar el brief previo. */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maat, resolveClient, reply, fail, fmtCo, coLocalToUtcIso, daysAgo, MaatError } from "../maat.js";

/** Nombre legible del destinatario de una sesion (grupo o cliente). */
async function targetName(s: { modality: string; group_id: string | null; client_id: string | null }) {
  const sb = await maat();
  if (s.modality === "group" && s.group_id) {
    const { data } = await sb.from("mentor_groups").select("name").eq("id", s.group_id).maybeSingle();
    return data?.name ?? "Grupo";
  }
  if (s.client_id) {
    const { data } = await sb.from("profiles").select("full_name").eq("id", s.client_id).maybeSingle();
    return data?.full_name ?? "Cliente";
  }
  return "(sin destinatario)";
}

export function registerSesiones(server: McpServer) {
  server.registerTool(
    "maat_list_sessions",
    {
      title: "Agenda de sesiones",
      description:
        "Sesiones de mentoria agendadas (grupales y 1:1), con fecha en hora de Colombia, destinatario y lugar. " +
        "Por defecto muestra las proximas.",
      inputSchema: {
        scope: z.enum(["upcoming", "past"]).optional().describe("'upcoming' (proximas, por defecto) o 'past' (ya ocurridas)."),
        limit: z.number().int().min(1).max(50).optional().describe("Cuantas traer. Por defecto 10."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ scope, limit }) => {
      try {
        const sb = await maat();
        const past = scope === "past";
        const now = new Date().toISOString();
        let q = sb
          .from("mentor_sessions")
          .select("id, modality, group_id, client_id, title, scheduled_at, duration_min, location, status")
          .neq("status", "cancelled")
          .limit(limit ?? 10);
        q = past
          ? q.lt("scheduled_at", now).order("scheduled_at", { ascending: false })
          : q.gte("scheduled_at", now).order("scheduled_at", { ascending: true });

        const { data, error } = await q;
        if (error) return fail(`No pude leer la agenda: ${error.message}`);
        const rows = data ?? [];
        if (rows.length === 0) return reply(past ? "No hay sesiones pasadas registradas." : "No hay sesiones agendadas.", []);

        const named = await Promise.all(
          rows.map(async (s) => ({ ...s, destinatario: await targetName(s) })),
        );
        const lines = named.map(
          (s) =>
            `- ${fmtCo(s.scheduled_at)} · ${s.modality === "group" ? "grupal" : "1:1"} · ${s.destinatario}` +
            `${s.title ? ` — ${s.title}` : ""}${s.location ? ` (${s.location})` : ""}`,
        );
        return reply(`${named.length} sesion(es):\n${lines.join("\n")}`, named);
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );

  server.registerTool(
    "maat_schedule_session",
    {
      title: "Agendar sesion",
      description:
        "Agenda una sesion de mentoria (1:1 o grupal) y programa sus recordatorios push automaticos. " +
        "La fecha se interpreta en HORA DE COLOMBIA. El cliente recibira ademas un aviso de preparacion el dia anterior.",
      inputSchema: {
        modality: z.enum(["1on1", "group"]).describe("'1on1' para individual, 'group' para grupal."),
        when: z.string().describe("Fecha y hora en Colombia, formato YYYY-MM-DDTHH:MM. Ej: '2026-08-27T19:00'."),
        client: z.string().optional().describe("Solo para 1on1: nombre, email o id del cliente."),
        group: z.string().optional().describe("Solo para group: nombre o id del grupo."),
        title: z.string().optional().describe("Titulo de la sesion. Ej: 'Sesion 3 · Reescribir creencias'."),
        location: z.string().optional().describe("Lugar o enlace (Zoom, Meet...)."),
        duration_min: z.number().int().min(15).max(240).optional().describe("Duracion en minutos. Por defecto 60."),
        reminders: z.array(z.number().int()).optional().describe("Minutos antes para recordar. Por defecto [1440, 60] (24h y 1h)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        const sb = await maat();
        const { data: auth } = await sb.auth.getUser();
        const mentorId = auth.user?.id;
        if (!mentorId) return fail("Sesion sin usuario; reinicia el servidor MCP.");

        const scheduled = coLocalToUtcIso(args.when);
        if (new Date(scheduled).getTime() < Date.now()) {
          return fail(`Esa fecha ya paso (${fmtCo(scheduled)} hora Colombia). Agenda una futura.`);
        }

        let clientId: string | null = null;
        let groupId: string | null = null;
        let destinatario = "";

        if (args.modality === "1on1") {
          if (!args.client) return fail("Para una sesion 1:1 necesito el cliente (parametro 'client').");
          const c = await resolveClient(args.client);
          clientId = c.id;
          destinatario = c.full_name ?? c.email ?? "cliente";
        } else {
          if (!args.group) return fail("Para una sesion grupal necesito el grupo (parametro 'group').");
          const { data: groups } = await sb.from("mentor_groups").select("id, name").eq("active", true);
          const q = args.group.trim().toLowerCase();
          const matches = (groups ?? []).filter((g) => g.id === args.group || g.name?.toLowerCase().includes(q));
          if (matches.length === 0) {
            return fail(`No encontre el grupo "${args.group}". Grupos activos: ${(groups ?? []).map((g) => g.name).join(", ") || "(ninguno)"}.`);
          }
          if (matches.length > 1) return fail(`"${args.group}" coincide con: ${matches.map((g) => g.name).join(", ")}. Se mas especifico.`);
          groupId = matches[0].id;
          destinatario = matches[0].name;
        }

        const { data, error } = await sb
          .from("mentor_sessions")
          .insert({
            mentor_id: mentorId,
            modality: args.modality,
            group_id: groupId,
            client_id: clientId,
            title: args.title?.trim() || "",
            scheduled_at: scheduled,
            duration_min: args.duration_min ?? 60,
            location: args.location?.trim() || "",
            reminder_offsets: args.reminders ?? [1440, 60],
          })
          .select()
          .single();
        if (error) return fail(`No pude agendar: ${error.message}`);

        return reply(
          `Sesion agendada: ${args.modality === "group" ? "grupal" : "1:1"} con ${destinatario}, ` +
            `${fmtCo(scheduled)} (hora Colombia)${args.location ? `, en ${args.location}` : ""}. ` +
            `Recordatorios: ${(args.reminders ?? [1440, 60]).map((m) => (m >= 1440 ? `${m / 1440}d` : `${m}min`)).join(" y ")} antes, ` +
            `mas el aviso de preparacion del dia anterior.`,
          data,
        );
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );

  server.registerTool(
    "maat_session_brief",
    {
      title: "Brief previo a una sesion",
      description:
        "Prepara la sesion: quien asiste, en que semana va cada uno, hace cuanto no aparece, su coherencia reciente " +
        "y lo ultimo que escribio (aprendizaje, lo que le falto, su prioridad). Sirve para llegar a la sesion sabiendo " +
        "que tocar con cada persona. Sin argumentos usa la proxima sesion agendada.",
      inputSchema: {
        session_id: z.string().optional().describe("Id de la sesion. Si se omite, usa la proxima agendada."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ session_id }) => {
      try {
        const sb = await maat();
        let sesion;
        if (session_id) {
          const { data } = await sb.from("mentor_sessions").select("*").eq("id", session_id).maybeSingle();
          sesion = data;
          if (!sesion) return fail(`No encontre la sesion ${session_id}. Usa maat_list_sessions para ver los ids.`);
        } else {
          const { data } = await sb
            .from("mentor_sessions").select("*")
            .eq("status", "scheduled").gte("scheduled_at", new Date().toISOString())
            .order("scheduled_at").limit(1);
          sesion = (data ?? [])[0];
          if (!sesion) return reply("No hay sesiones proximas agendadas.", null);
        }

        // Asistentes
        let ids: string[] = [];
        if (sesion.modality === "group" && sesion.group_id) {
          const { data: mem } = await sb
            .from("mentor_group_members").select("client_id").eq("group_id", sesion.group_id).eq("active", true);
          ids = (mem ?? []).map((m) => m.client_id);
        } else if (sesion.client_id) {
          ids = [sesion.client_id];
        }
        if (ids.length === 0) return reply(`La sesion del ${fmtCo(sesion.scheduled_at)} no tiene asistentes asignados.`, null);

        const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
        const [profs, cals] = await Promise.all([
          sb.from("profiles").select("id, full_name, current_week").in("id", ids),
          sb.from("calibrations")
            .select("user_id, coherence, learning_text, missing_text, tomorrow_priority, created_at")
            .in("user_id", ids).gte("created_at", since).order("created_at", { ascending: false }),
        ]);

        const porUsuario = new Map<string, typeof cals.data>();
        for (const r of cals.data ?? []) {
          porUsuario.set(r.user_id, [...(porUsuario.get(r.user_id) ?? []), r] as typeof cals.data);
        }

        const bloques = (profs.data ?? []).map((p) => {
          const rows = porUsuario.get(p.id) ?? [];
          const cohs = rows.map((r) => r.coherence).filter((n): n is number => n != null);
          const avg = cohs.length ? (cohs.reduce((a, b) => a + b, 0) / cohs.length).toFixed(1) : "—";
          const ultimo = rows[0];
          const dias = ultimo ? daysAgo(ultimo.created_at) : null;
          const señal = dias === null ? "no ha cerrado ningun dia en 2 semanas" : dias === 0 ? "cerro hoy" : `ultimo cierre hace ${dias}d`;
          const detalle = [
            ultimo?.learning_text && `  aprendio: ${ultimo.learning_text}`,
            ultimo?.missing_text && `  le falto: ${ultimo.missing_text}`,
            ultimo?.tomorrow_priority && `  su prioridad: ${ultimo.tomorrow_priority}`,
          ].filter(Boolean);
          return `**${p.full_name ?? "(sin nombre)"}** — semana ${p.current_week ?? "?"}/16 · coherencia 14d: ${avg} · ${señal}` +
            (detalle.length ? `\n${detalle.join("\n")}` : "");
        });

        const dest = await targetName(sesion);
        const text =
          `Brief — ${sesion.modality === "group" ? "sesion grupal" : "sesion 1:1"} con ${dest}\n` +
          `${fmtCo(sesion.scheduled_at)} (hora Colombia)${sesion.location ? ` · ${sesion.location}` : ""}` +
          `${sesion.title ? `\nTema: ${sesion.title}` : ""}\n\n${bloques.join("\n\n")}`;

        return reply(text, { sesion, asistentes: profs.data });
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );
}
