/**
 * Envio de push a clientes.
 *
 * SEGURIDAD: esta es la unica herramienta que alcanza a personas reales y no se
 * puede deshacer. Por eso el comportamiento por DEFECTO es simular (dry-run):
 * devuelve a quien llegaria y con que texto, sin enviar nada. Solo envia de
 * verdad si se pasa confirm:true de forma explicita.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maat, accessToken, supabaseUrl, reply, fail, currentRole, MaatError } from "../maat.js";

export function registerNotificaciones(server: McpServer) {
  server.registerTool(
    "maat_send_push",
    {
      title: "Enviar notificacion push",
      description:
        "Envia una notificacion push a los clientes (todos, o un grupo). " +
        "IMPORTANTE: por defecto SIMULA — muestra a cuantas personas llegaria y el texto exacto, sin enviar. " +
        "Para enviar de verdad hay que repetir la llamada con confirm:true. " +
        "Siempre muestra al usuario la simulacion y pide su aprobacion antes de confirmar: " +
        "un push no se puede deshacer.",
      inputSchema: {
        title: z.string().min(1).max(60).describe("Titulo de la notificacion. Breve."),
        body: z.string().min(1).max(180).describe("Cuerpo del mensaje."),
        audience: z.enum(["all", "group"]).optional().describe("'all' (todos tus clientes activos, por defecto) o 'group'."),
        group: z.string().optional().describe("Nombre o id del grupo. Obligatorio si audience es 'group'."),
        confirm: z
          .boolean()
          .optional()
          .describe("false o ausente = simula sin enviar. true = ENVIA de verdad. Pide aprobacion al usuario antes de poner true."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const sb = await maat();
        const audience = args.audience ?? "all";
        let groupId: string | null = null;
        let destino = "todos tus clientes activos";

        if (audience === "group") {
          if (!args.group) return fail("Para audience:'group' necesito el grupo (parametro 'group').");
          const { data: groups } = await sb.from("mentor_groups").select("id, name").eq("active", true);
          const q = args.group.trim().toLowerCase();
          const matches = (groups ?? []).filter((g) => g.id === args.group || g.name?.toLowerCase().includes(q));
          if (matches.length === 0) {
            return fail(`No encontre el grupo "${args.group}". Grupos activos: ${(groups ?? []).map((g) => g.name).join(", ") || "(ninguno)"}.`);
          }
          if (matches.length > 1) return fail(`"${args.group}" coincide con: ${matches.map((g) => g.name).join(", ")}. Se mas especifico.`);
          groupId = matches[0].id;
          destino = `el grupo "${matches[0].name}"`;
        }

        // ── Calcular destinatarios reales (mismo criterio que la Edge Function) ──
        const { data: auth } = await sb.auth.getUser();
        const rol = await currentRole();
        let ids: string[] = [];
        if (audience === "group" && groupId) {
          const { data: mem } = await sb
            .from("mentor_group_members").select("client_id").eq("group_id", groupId).eq("active", true);
          ids = (mem ?? []).map((m) => m.client_id);
        } else if (rol === "admin") {
          const { data } = await sb.from("profiles").select("id").eq("role", "client").eq("active", true);
          ids = (data ?? []).map((c) => c.id);
        } else {
          const { data: mc } = await sb
            .from("mentor_clients").select("client_id").eq("mentor_id", auth.user!.id).or("active.eq.true,active.is.null");
          const asignados = (mc ?? []).map((m) => m.client_id);
          if (asignados.length) {
            const { data } = await sb.from("profiles").select("id").in("id", asignados).eq("active", true);
            ids = (data ?? []).map((c) => c.id);
          }
        }

        let conPush = 0;
        if (ids.length) {
          const { data: subs } = await sb.from("push_subscriptions").select("user_id").in("user_id", ids);
          conPush = new Set((subs ?? []).map((s) => s.user_id)).size;
        }

        // ── Dry run (por defecto) ──
        if (!args.confirm) {
          return reply(
            `SIMULACION — no se envio nada.\n\n` +
              `Destino: ${destino}\n` +
              `Alcance: ${ids.length} cliente(s), de los cuales ${conPush} tienen las notificaciones activadas ` +
              `(solo esos la recibirian).\n\n` +
              `Se enviaria:\n  ${args.title}\n  ${args.body}\n\n` +
              `Si el usuario aprueba este texto y este alcance, vuelve a llamar la herramienta con confirm:true.`,
            { dry_run: true, destinatarios: ids.length, con_push_activo: conPush, title: args.title, body: args.body },
          );
        }

        if (conPush === 0) {
          return fail(
            `No hay nadie con notificaciones activas en ${destino} (${ids.length} cliente(s) alcanzados, 0 con push). No envie nada.`,
          );
        }

        // ── Envio real via Edge Function (usa el JWT del mentor) ──
        const token = await accessToken();
        const res = await fetch(`${supabaseUrl()}/functions/v1/send-custom-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: args.title,
            body: args.body,
            audience,
            ...(groupId ? { group_id: groupId } : {}),
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) {
          return fail(`El envio fallo (HTTP ${res.status}): ${out?.error ?? "sin detalle"}.`);
        }

        return reply(
          `Push ENVIADO a ${destino}.\n` +
            `Destinatarios: ${out.recipients ?? ids.length} · dispositivos alcanzados: ${out.sent ?? "?"}\n\n` +
            `  ${args.title}\n  ${args.body}`,
          { dry_run: false, ...out },
        );
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );
}
