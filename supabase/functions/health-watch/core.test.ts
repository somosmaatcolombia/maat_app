// Pruebas del vigilante:  node --test supabase/functions/health-watch/core.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildMail, COOLDOWN_HOURS, evaluate, intervalMinutes, pickNew, type Snapshot } from "./core.ts";

const NOW = "2026-11-01T22:00:00Z";
const ago = (min: number) => new Date(new Date(NOW).getTime() - min * 60_000).toISOString();

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    now: NOW,
    jobs: [
      { jobid: 8, jobname: "maat-send-notifications", schedule: "0 * * * *", active: true, last_run: ago(20), last_status: "succeeded" },
      { jobid: 9, jobname: "maat-session-reminders", schedule: "*/15 * * * *", active: true, last_run: ago(5), last_status: "succeeded" },
      { jobid: 11, jobname: "maat-community-activity", schedule: "0 */3 * * *", active: true, last_run: ago(100), last_status: "succeeded" },
    ],
    http: { total_6h: 30, errors_6h: 0, last_error: null },
    push: { sent_24h: 12, last_sent_at: ago(90), sent_prev_30d: 300 },
    ...over,
  };
}

test("intervalMinutes entiende los horarios que usa MAAT", () => {
  assert.equal(intervalMinutes("*/15 * * * *"), 15);
  assert.equal(intervalMinutes("0 * * * *"), 60);
  assert.equal(intervalMinutes("0 */3 * * *"), 180);
  assert.equal(intervalMinutes("30 9 * * *"), 1440);
  assert.equal(intervalMinutes("0 9 * * 1"), 7 * 1440);
  assert.equal(intervalMinutes("raro"), 1440);
});

test("un sistema sano no genera problemas", () => {
  assert.deepEqual(evaluate(snap()), []);
});

test("detecta el 401 de los crons (el fallo real de septiembre)", () => {
  const i = evaluate(snap({ http: { total_6h: 30, errors_6h: 6, last_error: { at: ago(10), status: 401, msg: "Invalid JWT" } } }));
  assert.equal(i.length, 1);
  assert.equal(i[0].key, "http_errors");
  assert.match(i[0].text, /401/);
  assert.match(i[0].text, /Invalid JWT/);
});

test("detecta una tarea desactivada, atrasada o fallida", () => {
  const s = snap();
  s.jobs[0].active = false;
  s.jobs[1].last_run = ago(120); // cada 15 min -> limite 45 min
  s.jobs[2].last_status = "failed";
  const keys = evaluate(s).map((x) => x.key).sort();
  assert.deepEqual(keys, [
    "job_failed:maat-community-activity",
    "job_inactive:maat-send-notifications",
    "job_stale:maat-session-reminders",
  ]);
});

test("una tarea cada hora con 100 min de atraso aun no es problema; con 3 h si", () => {
  const s = snap();
  s.jobs[0].last_run = ago(100);
  assert.deepEqual(evaluate(s), []);
  s.jobs[0].last_run = ago(180);
  assert.equal(evaluate(s)[0].key, "job_stale:maat-send-notifications");
});

test("silencio de push: solo si antes enviaba", () => {
  assert.equal(evaluate(snap({ push: { sent_24h: 0, last_sent_at: ago(50 * 60), sent_prev_30d: 200 } }))[0].key, "push_silence");
  assert.deepEqual(evaluate(snap({ push: { sent_24h: 0, last_sent_at: null, sent_prev_30d: 0 } })), []);
  assert.deepEqual(evaluate(snap({ push: { sent_24h: 0, last_sent_at: ago(30 * 60), sent_prev_30d: 200 } })), []);
});

test("pickNew respeta el enfriamiento de 12 h por problema", () => {
  const issues = evaluate(snap({ http: { total_6h: 3, errors_6h: 3, last_error: { at: ago(5), status: 500, msg: null } } }));
  const now = new Date(NOW);
  const avisado = [{ kind: "http_errors", detail: { key: "http_errors" }, created_at: ago(60) }];
  assert.deepEqual(pickNew(issues, avisado, now), []);
  const viejo = [{ kind: "http_errors", detail: { key: "http_errors" }, created_at: ago(COOLDOWN_HOURS * 60 + 5) }];
  assert.equal(pickNew(issues, viejo, now).length, 1);
  const otro = [{ kind: "job_stale", detail: { key: "job_stale:x" }, created_at: ago(10) }];
  assert.equal(pickNew(issues, otro, now).length, 1);
});

test("el correo lista cada problema y escapa el HTML", () => {
  const m = buildMail([{ key: "k", kind: "http_errors", text: "fallo <b>raro</b> & mas", detail: {} }], "https://somosmaat.org/panel/");
  assert.match(m.subject, /1 alerta del sistema/);
  assert.ok(m.html.includes("&lt;b&gt;raro&lt;/b&gt; &amp; mas"));
  assert.ok(m.text.includes("https://somosmaat.org/panel/"));
});
