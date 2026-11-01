// Pruebas de core.ts con una base de datos simulada:  node --test supabase/functions/testimonial/core.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { handle, type Deps, type Row, type NewRow } from "./core.ts";
import { sha256Hex, MAX_PER_IP_PER_DAY } from "./lib.ts";

const QUOTE = "Llegue sintiendo que cumplia con todo y no me reconocia por dentro. Hoy decido con mas calma y cuido lo que me importa.";
const PNG = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]).toString("base64");
const JPG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64");

function world(opts: { profiles?: Record<string, string>; failInsert?: boolean; failUpload?: boolean } = {}) {
  const rows = new Map<string, Row & Record<string, unknown>>();
  const files = new Map<string, Uint8Array>();
  const notes: Array<{ kind: string; manageUrl: string | null }> = [];
  let n = 0;
  const d: Deps = {
    now: () => new Date("2026-10-27T12:00:00Z"),
    randomId: () => `id${++n}`,
    supabaseUrl: "https://x.supabase.co",
    allowedOrigins: ["https://somosmaat.org", "https://v2.somosmaat.org"],
    ipSalt: "sal",
    async insertRow(r: NewRow) {
      if (opts.failInsert) return { error: "db" };
      const id = `row${rows.size + 1}`;
      rows.set(id, { ...r, id, created_at: "2026-10-27T12:00:00Z", published_at: null });
      return {};
    },
    async updateRow(id, patch) { Object.assign(rows.get(id)!, patch); return {}; },
    async findByTokenHash(h) { const r = [...rows.values()].find((x) => x.manage_token_hash === h); return r ? { ...r } : null; }, // copia, como la base real
    async countRecentByIp(h) { return [...rows.values()].filter((r) => r.ip_hash === h).length; },
    async matchProfile(email) { return opts.profiles?.[email] ?? null; },
    async uploadPhoto(path, bytes) { if (opts.failUpload) return { error: "x" }; files.set(path, bytes); return {}; },
    async deletePhoto(path) { files.delete(path); },
    async notify(ev) { notes.push({ kind: ev.kind, manageUrl: ev.manageUrl }); return { emailedPerson: ev.kind === "new" }; },
  };
  return { d, rows, files, notes };
}

const body = (over: Record<string, unknown> = {}) => ({
  op: "submit", name: "Laura Perez", email: "laura@example.com", role: "Directora de operaciones",
  location: "Medellin, Colombia", quote: QUOTE, lang: "es", consent: true, elapsed_ms: 9000,
  manage_base: "https://somosmaat.org/es/testimonios/", ...over,
});
const tokenOf = (url: string) => new URL(url).searchParams.get("edit")!;

test("enviar: guarda pendiente, sube la foto y devuelve un enlace privado", async () => {
  const w = world({ profiles: { "laura@example.com": "user-1" } });
  const r = await handle(body({ photo: PNG }), "1.2.3.4", w.d);
  assert.equal(r.status, 200);
  assert.equal(r.body.emailed, true);
  const url = String(r.body.manage_url);
  assert.match(url, /^https:\/\/somosmaat\.org\/es\/testimonios\/\?edit=[A-Za-z0-9_-]{43}#comparte$/);
  assert.equal(w.rows.size, 1);
  const row = [...w.rows.values()][0];
  assert.equal(row.status, "pending");                       // nunca se publica solo
  assert.equal(row.matched_user_id, "user-1");               // cruce con el cliente (feedback)
  assert.match(String(row.photo_path), /^id1\.png$/);
  assert.equal(w.files.size, 1);
  assert.notEqual(row.manage_token_hash, tokenOf(url));      // se guarda el hash, no el token
  assert.equal(row.manage_token_hash, await sha256Hex(tokenOf(url)));
  assert.equal(JSON.stringify(r.body).includes("laura@example.com"), false); // el correo no vuelve en la respuesta
});

test("enviar: sin foto tambien funciona y sin cliente coincidente queda sin enlace a perfil", async () => {
  const w = world();
  const r = await handle(body(), "1.2.3.4", w.d);
  assert.equal(r.status, 200);
  const row = [...w.rows.values()][0];
  assert.equal(row.photo_path, null);
  assert.equal(row.matched_user_id, null);
});

test("enviar: datos invalidos -> 400 con el detalle por campo y no guarda nada", async () => {
  const w = world();
  const r = await handle(body({ quote: "corto", consent: false }), "1.2.3.4", w.d);
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.fields as object).sort(), ["consent", "quote"]);
  assert.equal(w.rows.size, 0);
});

test("enviar: bots. Campo oculto = exito falso sin guardar; demasiado rapido = 400", async () => {
  const w = world();
  const trap = await handle(body({ website: "http://spam.example" }), "1.2.3.4", w.d);
  assert.equal(trap.status, 200);
  assert.equal(trap.body.manage_url, null);
  assert.equal(w.rows.size, 0);
  const fast = await handle(body({ elapsed_ms: 300 }), "1.2.3.4", w.d);
  assert.equal(fast.status, 400);
  assert.equal(fast.body.error, "too_fast");
  const missing = await handle(body({ elapsed_ms: undefined }), "1.2.3.4", w.d);
  assert.equal(missing.status, 400);
});

test("enviar: limite por IP en 24 h (el siguiente recibe 429)", async () => {
  const w = world();
  for (let i = 0; i < MAX_PER_IP_PER_DAY; i++) {
    const r = await handle(body({ name: `Persona ${i}x` }), "9.9.9.9", w.d);
    assert.equal(r.status, 200);
  }
  assert.equal((await handle(body(), "9.9.9.9", w.d)).status, 429);
  assert.equal((await handle(body(), "8.8.8.8", w.d)).status, 200); // otra IP si pasa
});

test("enviar: archivos disfrazados o enormes se rechazan SIN subir nada", async () => {
  const w = world();
  const fake = await handle(body({ photo: "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64") }), "1.1.1.1", w.d);
  assert.equal(fake.status, 400);
  assert.equal(fake.body.error, "photo_invalid");
  const huge = await handle(body({ photo: "data:image/jpeg;base64," + Buffer.alloc(600 * 1024, 1).toString("base64") }), "1.1.1.1", w.d);
  assert.equal(huge.status, 413);
  assert.equal(w.files.size, 0);
  assert.equal(w.rows.size, 0);
});

test("enviar: si falla el guardado se borra la foto ya subida (no quedan huerfanas)", async () => {
  const w = world({ failInsert: true });
  const r = await handle(body({ photo: JPG }), "1.1.1.1", w.d);
  assert.equal(r.status, 500);
  assert.equal(w.files.size, 0);
});

test("enviar: el enlace de gestion nunca apunta a un dominio ajeno", async () => {
  const w = world();
  const r = await handle(body({ manage_base: "https://evil.example/es/testimonios/" }), "1.1.1.1", w.d);
  assert.match(String(r.body.manage_url), /^https:\/\/somosmaat\.org\/es\/testimonios\/\?edit=/);
});

test("gestionar: con el enlace se consulta, con otro token no", async () => {
  const w = world();
  const sent = await handle(body({ photo: PNG }), "1.1.1.1", w.d);
  const token = tokenOf(String(sent.body.manage_url));
  const got = await handle({ op: "get", token }, "5.5.5.5", w.d);
  assert.equal(got.status, 200);
  assert.equal((got.body.data as Record<string, unknown>).name, "Laura Perez");
  assert.equal((got.body.data as Record<string, unknown>).photo_url, "https://x.supabase.co/storage/v1/object/public/testimonial-photos/id1.png");
  assert.equal(got.body.status, "pending");
  for (const bad of ["x".repeat(43), "corto", undefined, 123]) {
    assert.equal((await handle({ op: "get", token: bad }, "5.5.5.5", w.d)).status, 404);
  }
});

test("editar: un testimonio aprobado vuelve a revision y se cambia/borra la foto", async () => {
  const w = world();
  const sent = await handle(body({ photo: PNG }), "1.1.1.1", w.d);
  const token = tokenOf(String(sent.body.manage_url));
  const row = [...w.rows.values()][0];
  row.status = "approved"; row.published_at = "2026-10-28T00:00:00Z";   // MAAT lo aprobo
  const edit = await handle({ ...body({ quote: QUOTE + " Y sigo practicando cada dia.", photo: JPG }), op: "update", token }, "5.5.5.5", w.d);
  assert.equal(edit.status, 200);
  assert.equal(row.status, "pending");                  // ya no esta publicado hasta que MAAT lo vuelva a aprobar
  assert.equal(row.published_at, null);
  assert.match(String(row.quote), /sigo practicando/);
  assert.equal(w.files.size, 1);                         // la foto vieja se borro, solo queda la nueva
  assert.match(String(row.photo_path), /\.jpg$/);
  const noPhoto = await handle({ ...body(), op: "update", token, remove_photo: true }, "5.5.5.5", w.d);
  assert.equal(noPhoto.status, 200);
  assert.equal(row.photo_path, null);
  assert.equal(w.files.size, 0);
});

test("editar: datos invalidos no cambian nada; el idioma original se conserva", async () => {
  const w = world();
  const sent = await handle(body({ lang: "en", name: "Erik Fisher" }), "1.1.1.1", w.d);
  const token = tokenOf(String(sent.body.manage_url));
  const bad = await handle({ op: "update", token, name: "", quote: "x", consent: true }, "5.5.5.5", w.d);
  assert.equal(bad.status, 400);
  const ok = await handle({ op: "update", token, name: "Erik Fisher", role: "Entrepreneur", location: "Austin, USA", quote: QUOTE, consent: true }, "5.5.5.5", w.d);
  assert.equal(ok.status, 200);
  assert.equal([...w.rows.values()][0].lang, "en");
});

test("retirar: desaparece de inmediato, se borra la foto y no se puede editar despues", async () => {
  const w = world();
  const sent = await handle(body({ photo: PNG }), "1.1.1.1", w.d);
  const token = tokenOf(String(sent.body.manage_url));
  const row = [...w.rows.values()][0];
  row.status = "approved";
  const r = await handle({ op: "withdraw", token }, "5.5.5.5", w.d);
  assert.equal(r.status, 200);
  assert.equal(row.status, "withdrawn");
  assert.equal(row.photo_path, null);
  assert.equal(w.files.size, 0);
  assert.equal((await handle({ op: "withdraw", token }, "5.5.5.5", w.d)).status, 200, "retirar dos veces es inofensivo");
  assert.equal((await handle({ ...body(), op: "update", token }, "5.5.5.5", w.d)).status, 409);
});

test("operacion desconocida -> 400", async () => {
  assert.equal((await handle({ op: "drop_table" }, "1.1.1.1", world().d)).status, 400);
});
