/** Reportes de cohorte y cierre de proceso (feedback, referidos, graduaciones). */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maat, reply, fail, daysAgo, MaatError } from "../maat.js";

const FASES = [
  { n: 1, nombre: "GRATITUD", semanas: "1-4" },
  { n: 2, nombre: "AMOR", semanas: "5-8" },
  { n: 3, nombre: "INTENCION", semanas: "9-12" },
  { n: 4, nombre: "VOLUNTAD", semanas: "13-16" },
];
const fase = (w: number | null) => (!w ? null : w <= 4 ? 1 : w <= 8 ? 2 : w <= 12 ? 3 : 4);

export function registerReportes(server: McpServer) {
  server.registerTool(
    "maat_cohort_report",
    {
      title: "Reporte de cohorte",
      description:
        "Estado general de la mentoria: cuantos clientes activos, como se reparten por fase del proceso, " +
        "que porcentaje cerro su dia en la ultima semana, coherencia promedio y cuantos estan en riesgo. " +
        "Es la foto para saber como va todo sin revisar cliente por cliente.",
      inputSchema: {
        days: z.number().int().min(1).max(90).optional().describe("Ventana de analisis en dias. Por defecto 7."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ days }) => {
      try {
        const sb = await maat();
        const window = days ?? 7;
        const since = new Date(Date.now() - window * 86_400_000).toISOString();

        const { data: profs, error } = await sb
          .from("profiles")
          .select("id, full_name, current_week, active, graduated")
          .eq("role", "client");
        if (error) return fail(`No pude leer los clientes: ${error.message}`);

        const activos = (profs ?? []).filter((c) => c.active !== false && !c.graduated);
        const suspendidos = (profs ?? []).filter((c) => c.active === false).length;
        const graduados = (profs ?? []).filter((c) => c.graduated).length;
        if (activos.length === 0) return reply("No hay clientes activos en la mentoria.", null);

        const ids = activos.map((c) => c.id);
        const { data: cals } = await sb
          .from("calibrations").select("user_id, coherence, created_at").in("user_id", ids).gte("created_at", since);

        const cerraron = new Set((cals ?? []).map((r) => r.user_id));
        const cohs = (cals ?? []).map((r) => r.coherence).filter((n): n is number => n != null);
        const avgCoh = cohs.length ? (cohs.reduce((a, b) => a + b, 0) / cohs.length).toFixed(1) : "—";
        const tasa = Math.round((cerraron.size / activos.length) * 100);

        const porFase = FASES.map((f) => ({
          ...f,
          n_clientes: activos.filter((c) => fase(c.current_week) === f.n).length,
        }));

        // En riesgo: sin cerrar en la ventana
        const enRiesgo = activos.filter((c) => !cerraron.has(c.id));

        const text = [
          `**Cohorte MAAT — ultimos ${window} dias**`,
          ``,
          `Clientes activos: ${activos.length}  (${suspendidos} suspendidos · ${graduados} graduados)`,
          `Cerraron su dia al menos una vez: ${cerraron.size}/${activos.length} (${tasa}%)`,
          `Cierres totales: ${(cals ?? []).length} · coherencia promedio: ${avgCoh}/10`,
          ``,
          `Por fase del proceso:`,
          ...porFase.map((f) => `  Fase ${f.n} ${f.nombre} (sem ${f.semanas}): ${f.n_clientes}`),
          ``,
          enRiesgo.length
            ? `Sin cerrar ningun dia en la ventana (${enRiesgo.length}): ${enRiesgo.map((c) => c.full_name).join(", ")}`
            : `Todos los activos cerraron al menos un dia. Buen ritmo.`,
        ].join("\n");

        return reply(text, {
          ventana_dias: window,
          activos: activos.length,
          suspendidos,
          graduados,
          cerraron: cerraron.size,
          tasa_cierre_pct: tasa,
          coherencia_promedio: avgCoh,
          por_fase: porFase,
          en_riesgo: enRiesgo.map((c) => ({ id: c.id, nombre: c.full_name, semana: c.current_week })),
        });
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );

  server.registerTool(
    "maat_feedback_report",
    {
      title: "Reporte de feedback y satisfaccion",
      description:
        "Resultados del sistema de trazabilidad: NPS, satisfaccion promedio, y la curva de transformacion " +
        "(actitud, claridad, confianza, energia y entorno) comparando inicio, intermedio y cierre. " +
        "Responde '¿como de bien esta funcionando la mentoria?' con datos.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const sb = await maat();
        const { data, error } = await sb.rpc("get_feedback_overview");
        if (error) return fail(`No pude leer el reporte de feedback: ${error.message}`);
        if (!data) return reply("Todavia no hay datos de feedback.", null);

        const o = data as any;
        const nps = o.nps ?? {};
        const bm = o.by_moment ?? {};
        const dims = ["actitud", "claridad", "confianza", "energia", "ent_profesional", "ent_relaciones", "ent_familiar", "ent_intrapersonal"];

        const curva = dims.map((d) => {
          const ini = bm.inicio?.[d] ?? null;
          const fin = bm.final?.[d] ?? null;
          const delta = ini != null && fin != null ? (fin - ini).toFixed(1) : null;
          return { dimension: d, inicio: ini, intermedio: bm.intermedio?.[d] ?? null, final: fin, delta };
        });

        const text = [
          `**Feedback de la mentoria**`,
          ``,
          `NPS: ${nps.score ?? "—"}  (${nps.promoters ?? 0} promotores · ${nps.passives ?? 0} pasivos · ${nps.detractors ?? 0} detractores, sobre ${nps.n ?? 0} respuestas)`,
          `Satisfaccion al cierre: ${bm.final?.satisfaccion ?? "—"}/10`,
          `Respuestas: inicio ${bm.inicio?.n ?? 0} · intermedio ${bm.intermedio?.n ?? 0} · cierre ${bm.final?.n ?? 0}`,
          `Clientes totales: ${o.clients_total ?? "—"} · referidos capturados: ${o.referrals_total ?? 0} (${o.referrals_pending_sync ?? 0} sin pasar al CRM)`,
          ``,
          `Curva de transformacion (inicio → cierre):`,
          ...curva.map((c) => `  ${c.dimension}: ${c.inicio ?? "—"} → ${c.final ?? "—"}${c.delta ? `  (${Number(c.delta) > 0 ? "+" : ""}${c.delta})` : ""}`),
        ].join("\n");

        return reply(text, { nps, por_momento: bm, curva, totales: { clientes: o.clients_total, referidos: o.referrals_total } });
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );

  server.registerTool(
    "maat_list_referrals",
    {
      title: "Leads referidos",
      description:
        "Personas recomendadas por tus clientes al cerrar su proceso, con el motivo por el que creen que lo necesitan " +
        "y si ya pasaron al CRM. El CRM es otro proyecto Supabase, asi que el traspaso es manual.",
      inputSchema: {
        pending_only: z.boolean().optional().describe("Solo los que aun no pasaron al CRM. Por defecto false."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ pending_only }) => {
      try {
        const sb = await maat();
        let q = sb
          .from("client_referrals")
          .select("id, referred_by, name, contact, reason, synced_to_crm, created_at")
          .order("created_at", { ascending: false });
        if (pending_only) q = q.eq("synced_to_crm", false);

        const { data, error } = await q;
        if (error) return fail(`No pude leer los referidos: ${error.message}`);
        const rows = data ?? [];
        if (rows.length === 0) return reply(pending_only ? "No hay referidos pendientes de pasar al CRM." : "Todavia no hay referidos.", []);

        const { data: profs } = await sb
          .from("profiles").select("id, full_name").in("id", [...new Set(rows.map((r) => r.referred_by))]);
        const nombre = new Map((profs ?? []).map((p) => [p.id, p.full_name]));

        const lines = rows.map(
          (r) =>
            `- ${r.name} — ${r.contact}${r.reason ? ` · "${r.reason}"` : ""}\n` +
            `    referido por ${nombre.get(r.referred_by) ?? "?"} · ${r.synced_to_crm ? "ya en CRM" : "PENDIENTE de CRM"}`,
        );
        return reply(`${rows.length} referido(s):\n${lines.join("\n")}`, rows);
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );

  server.registerTool(
    "maat_graduating_soon",
    {
      title: "Cierres proximos",
      description:
        "Clientes que se acercan al final de las 16 semanas, con el estado de su feedback de trazabilidad " +
        "(si ya entrego inicio, intermedio y cierre). Sirve para no dejar pasar ningun cierre sin su encuesta ni sus referidos.",
      inputSchema: {
        from_week: z.number().int().min(1).max(16).optional().describe("Desde que semana considerar 'proximo a cerrar'. Por defecto 13."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ from_week }) => {
      try {
        const sb = await maat();
        const desde = from_week ?? 13;
        const { data: profs, error } = await sb
          .from("profiles")
          .select("id, full_name, email, current_week, active, graduated")
          .eq("role", "client")
          .gte("current_week", desde)
          .order("current_week", { ascending: false });
        if (error) return fail(`No pude leer los clientes: ${error.message}`);

        const rows = (profs ?? []).filter((c) => c.active !== false);
        if (rows.length === 0) return reply(`Ningun cliente activo va en semana ${desde} o mas.`, []);

        const [fb, refs] = await Promise.all([
          sb.from("client_feedback").select("user_id, moment").in("user_id", rows.map((c) => c.id)),
          sb.from("client_referrals").select("referred_by").in("referred_by", rows.map((c) => c.id)),
        ]);
        const momentos = new Map<string, string[]>();
        for (const f of fb.data ?? []) momentos.set(f.user_id, [...(momentos.get(f.user_id) ?? []), f.moment]);
        const conRefs = new Set((refs.data ?? []).map((r) => r.referred_by));

        const lines = rows.map((c) => {
          const m = momentos.get(c.id) ?? [];
          const falta = ["inicio", "intermedio", "final"].filter((x) => !m.includes(x));
          const estado = falta.length === 0 ? "feedback completo" : `falta: ${falta.join(", ")}`;
          return `- ${c.full_name ?? c.email} — semana ${c.current_week}/16${c.graduated ? " (graduado)" : ""}\n` +
            `    ${estado} · referidos: ${conRefs.has(c.id) ? "si" : "no"}`;
        });

        return reply(
          `${rows.length} cliente(s) en semana ${desde}+:\n${lines.join("\n")}`,
          rows.map((c) => ({
            id: c.id,
            nombre: c.full_name,
            semana: c.current_week,
            graduado: c.graduated,
            feedback: momentos.get(c.id) ?? [],
            tiene_referidos: conRefs.has(c.id),
          })),
        );
      } catch (e) {
        return fail(e instanceof MaatError ? e.message : `Error inesperado: ${String(e)}`);
      }
    },
  );
}
