// Logica pura del vigilante (sin imports remotos: se prueba con node --test).
// Decide QUE esta mal a partir de una foto del sistema (cron + respuestas HTTP + push enviados).

export type Job = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_status: string | null;
};
export type Snapshot = {
  now: string;
  jobs: Job[];
  http: {
    total_6h: number;
    errors_6h: number;
    last_error: { at: string; status: number | null; msg: string | null } | null;
  };
  push: { sent_24h: number; last_sent_at: string | null; sent_prev_30d: number };
};
export type Issue = { key: string; kind: string; text: string; detail: Record<string, unknown> };

const MIN = 60_000;
export const COOLDOWN_HOURS = 12;
export const SILENCE_HOURS = 48;

/** Cada cuantos minutos corre un cron ("m h dom mon dow"). Aproximado: solo sirve para detectar atrasos grandes. */
export function intervalMinutes(schedule: string): number {
  const f = schedule.trim().split(/\s+/);
  if (f.length < 5) return 1440;
  const [m, h, dom, , dow] = f;
  if (dow !== "*") return 7 * 1440;
  if (dom !== "*") return 30 * 1440;
  if (h === "*") {
    const step = /^\*\/(\d+)$/.exec(m);
    return step ? Math.max(1, parseInt(step[1], 10)) : 60;
  }
  const hs = /^\*\/(\d+)$/.exec(h);
  if (hs) return Math.max(1, parseInt(hs[1], 10)) * 60;
  return h.includes(",") ? Math.floor(1440 / h.split(",").length) : 1440;
}

export function evaluate(s: Snapshot): Issue[] {
  const now = new Date(s.now).getTime();
  const out: Issue[] = [];

  for (const j of s.jobs) {
    if (!j.active) {
      out.push({
        key: `job_inactive:${j.jobname}`, kind: "job_inactive",
        text: `La tarea programada "${j.jobname}" esta desactivada.`, detail: { job: j.jobname },
      });
      continue;
    }
    if (j.last_status === "failed") {
      out.push({
        key: `job_failed:${j.jobname}`, kind: "job_failed",
        text: `La ultima corrida de "${j.jobname}" fallo.`, detail: { job: j.jobname, last_run: j.last_run },
      });
    }
    if (j.last_run) {
      const ageMin = (now - new Date(j.last_run).getTime()) / MIN;
      const limit = 2 * intervalMinutes(j.schedule) + 15;
      if (ageMin > limit) {
        out.push({
          key: `job_stale:${j.jobname}`, kind: "job_stale",
          text: `"${j.jobname}" no corre desde hace ${Math.round(ageMin / 60 * 10) / 10} h (deberia correr "${j.schedule}").`,
          detail: { job: j.jobname, last_run: j.last_run, schedule: j.schedule },
        });
      }
    }
  }

  if (s.http.errors_6h > 0) {
    const e = s.http.last_error;
    out.push({
      key: "http_errors", kind: "http_errors",
      text: `${s.http.errors_6h} llamada(s) de las tareas programadas fallaron en las ultimas 6 h` +
        (e ? ` (la ultima: HTTP ${e.status ?? "sin respuesta"}${e.msg ? ` - ${e.msg}` : ""}).` : "."),
      detail: { errors_6h: s.http.errors_6h, total_6h: s.http.total_6h, last_error: e },
    });
  }

  const last = s.push.last_sent_at ? new Date(s.push.last_sent_at).getTime() : 0;
  if (s.push.sent_prev_30d > 0 && (now - last) / MIN > SILENCE_HOURS * 60) {
    out.push({
      key: "push_silence", kind: "push_silence",
      text: `No se ha enviado ninguna notificacion push en mas de ${SILENCE_HOURS} h (antes enviaba con normalidad).`,
      detail: { last_sent_at: s.push.last_sent_at, sent_prev_30d: s.push.sent_prev_30d },
    });
  }
  return out;
}

/** Quita los problemas ya avisados hace menos de COOLDOWN_HOURS (para no llenar el correo cada hora). */
export function pickNew(
  issues: Issue[],
  recent: { kind: string; detail: Record<string, unknown> | null; created_at: string }[],
  now: Date,
): Issue[] {
  const limit = now.getTime() - COOLDOWN_HOURS * 3600_000;
  const seen = new Set(
    recent.filter((r) => new Date(r.created_at).getTime() > limit)
      .map((r) => String((r.detail as { key?: string } | null)?.key ?? r.kind)),
  );
  return issues.filter((i) => !seen.has(i.key));
}

export function buildMail(issues: Issue[], panelUrl: string) {
  const n = issues.length;
  const lines = issues.map((i) => `- ${i.text}`);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    subject: n === 1 && issues[0].kind === "test" ? "MAAT: prueba de alertas" : `MAAT: ${n} alerta${n > 1 ? "s" : ""} del sistema`,
    text: `El vigilante de MAAT detecto:\n\n${lines.join("\n")}\n\nRevisalo en el panel: ${panelUrl}\n` +
      `(No volvera a avisar de lo mismo en ${COOLDOWN_HOURS} h.)`,
    html: `<div style="font:16px/1.6 Arial,sans-serif;color:#2a2030;max-width:560px;margin:0 auto;padding:24px">` +
      `<p><strong>El vigilante de MAAT detecto:</strong></p><ul>${issues.map((i) => `<li>${esc(i.text)}</li>`).join("")}</ul>` +
      `<p><a href="${esc(panelUrl)}" style="background:#896C8E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:24px;display:inline-block">Abrir el panel</a></p>` +
      `<p style="font-size:13px;color:#8a7d8c">No volvera a avisar de lo mismo en ${COOLDOWN_HOURS} h. MAAT · somosmaat.org</p></div>`,
  };
}
