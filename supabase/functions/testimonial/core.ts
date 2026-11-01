// Orquestacion de la Edge Function `testimonial`, con dependencias inyectadas:
// index.ts la conecta a Supabase/SMTP; core.test.ts la prueba con una base de datos simulada.
import {
  validate, parsePhoto, newToken, sha256Hex, looksLikeToken, safeBase, manageUrl, publicPhotoUrl,
  cleanLine, MIN_FILL_MS, MAX_PER_IP_PER_DAY, type Lang,
} from "./lib.ts";

export type Row = {
  id: string; status: "pending" | "approved" | "rejected" | "withdrawn"; lang: Lang;
  name: string; email: string; role: string; location: string; quote: string;
  photo_path: string | null; created_at: string; published_at: string | null;
  matched_user_id: string | null;
};
export type NewRow = Omit<Row, "id" | "created_at" | "published_at"> & {
  consent: true; manage_token_hash: string; ip_hash: string;
};

export interface Deps {
  now(): Date;
  randomId(): string;
  supabaseUrl: string;
  allowedOrigins: string[];
  ipSalt: string;
  insertRow(row: NewRow): Promise<{ error?: string }>;
  updateRow(id: string, patch: Record<string, unknown>): Promise<{ error?: string }>;
  findByTokenHash(hash: string): Promise<Row | null>;
  countRecentByIp(ipHash: string, sinceIso: string): Promise<number>;
  matchProfile(email: string): Promise<string | null>;
  uploadPhoto(path: string, bytes: Uint8Array, mime: string): Promise<{ error?: string }>;
  deletePhoto(path: string): Promise<void>;
  notify(ev: { kind: "new" | "updated"; row: Pick<Row, "name" | "email" | "role" | "location" | "quote" | "lang" | "matched_user_id">; manageUrl: string | null }): Promise<{ emailedPerson: boolean }>;
}

export type Out = { status: number; body: Record<string, unknown> };
const out = (status: number, body: Record<string, unknown>): Out => ({ status, body });

const DEFAULT_PAGE: Record<Lang, string> = { es: "/es/testimonios/", en: "/en/testimonials/" };

function baseFor(b: Record<string, unknown>, lang: Lang, d: Deps): string {
  return safeBase(b.manage_base, d.allowedOrigins) ?? (d.allowedOrigins[0] + DEFAULT_PAGE[lang]);
}

export async function handle(b: Record<string, unknown>, ip: string, d: Deps): Promise<Out> {
  const op = typeof b.op === "string" ? b.op : "submit";
  switch (op) {
    case "submit": return submit(b, ip, d);
    case "get": return withToken(b, d, async (row) => out(200, { ok: true, ...present(row, d) }));
    case "update": return withToken(b, d, (row) => update(b, row, d));
    case "withdraw": return withToken(b, d, (row) => withdraw(row, d));
    default: return out(400, { error: "bad_op" });
  }
}

function present(row: Row, d: Deps) {
  return {
    status: row.status,
    data: {
      name: row.name, email: row.email, role: row.role, location: row.location, quote: row.quote,
      lang: row.lang, photo_url: publicPhotoUrl(d.supabaseUrl, row.photo_path),
      created_at: row.created_at, published_at: row.published_at,
    },
  };
}

async function withToken(b: Record<string, unknown>, d: Deps, fn: (row: Row) => Promise<Out>): Promise<Out> {
  if (!looksLikeToken(b.token)) return out(404, { error: "not_found" });
  const row = await d.findByTokenHash(await sha256Hex(b.token));
  if (!row) return out(404, { error: "not_found" });
  return fn(row);
}

async function submit(b: Record<string, unknown>, ip: string, d: Deps): Promise<Out> {
  // trampa para bots: un campo oculto que una persona nunca llena. Se responde "ok" sin guardar nada.
  if (cleanLine(b.website)) return out(200, { ok: true, manage_url: null, emailed: false });
  if (!(Number(b.elapsed_ms) >= MIN_FILL_MS)) return out(400, { error: "too_fast" });

  const v = validate(b);
  if (!v.ok) return out(400, { error: "invalid", fields: v.fields });

  const ipHash = await sha256Hex(`${ip}|${d.ipSalt}`);
  const since = new Date(d.now().getTime() - 24 * 3600 * 1000).toISOString();
  if (await d.countRecentByIp(ipHash, since) >= MAX_PER_IP_PER_DAY) return out(429, { error: "rate_limited" });

  let photoPath: string | null = null;
  if (typeof b.photo === "string" && b.photo) {
    const p = parsePhoto(b.photo);
    if (!p.ok) return out(p.error === "photo_too_large" ? 413 : 400, { error: p.error });
    photoPath = `${d.randomId()}.${p.photo.ext}`;
    const up = await d.uploadPhoto(photoPath, p.photo.bytes, p.photo.mime);
    if (up.error) return out(500, { error: "photo_upload_failed" });
  }

  const token = newToken();
  const f = v.value;
  const row: NewRow = {
    status: "pending", lang: f.lang, name: f.name, email: f.email, role: f.role, location: f.location,
    quote: f.quote, photo_path: photoPath, consent: true,
    matched_user_id: await d.matchProfile(f.email),
    manage_token_hash: await sha256Hex(token), ip_hash: ipHash,
  };
  const ins = await d.insertRow(row);
  if (ins.error) {
    if (photoPath) await d.deletePhoto(photoPath);
    return out(500, { error: "save_failed" });
  }

  const url = manageUrl(baseFor(b, f.lang, d), token, f.lang);
  let emailed = false;
  try { emailed = (await d.notify({ kind: "new", row, manageUrl: url })).emailedPerson; } catch { /* el correo nunca tumba el envio */ }
  return out(200, { ok: true, manage_url: url, emailed });
}

async function update(b: Record<string, unknown>, row: Row, d: Deps): Promise<Out> {
  if (row.status === "withdrawn") return out(409, { error: "withdrawn" });
  const v = validate({ ...b, email: b.email ?? row.email, lang: b.lang ?? row.lang });
  if (!v.ok) return out(400, { error: "invalid", fields: v.fields });
  const f = v.value;

  let photoPath = row.photo_path;
  let toDelete: string | null = null;
  if (typeof b.photo === "string" && b.photo) {
    const p = parsePhoto(b.photo);
    if (!p.ok) return out(p.error === "photo_too_large" ? 413 : 400, { error: p.error });
    const path = `${d.randomId()}.${p.photo.ext}`;
    const up = await d.uploadPhoto(path, p.photo.bytes, p.photo.mime);
    if (up.error) return out(500, { error: "photo_upload_failed" });
    toDelete = row.photo_path;
    photoPath = path;
  } else if (b.remove_photo === true) {
    toDelete = row.photo_path;
    photoPath = null;
  }

  // Cualquier edicion vuelve a revision: lo publicado nunca cambia sin que MAAT lo vea.
  const patch = {
    name: f.name, email: f.email, role: f.role, location: f.location, quote: f.quote, lang: f.lang,
    photo_path: photoPath, status: "pending", published_at: null, consent: true,
    matched_user_id: await d.matchProfile(f.email),
  };
  const up = await d.updateRow(row.id, patch);
  if (up.error) {
    if (photoPath && photoPath !== row.photo_path) await d.deletePhoto(photoPath);
    return out(500, { error: "save_failed" });
  }
  if (toDelete) await d.deletePhoto(toDelete);
  try { await d.notify({ kind: "updated", row: { ...f, matched_user_id: patch.matched_user_id }, manageUrl: null }); } catch { /* idem */ }
  return out(200, { ok: true, status: "pending" });
}

async function withdraw(row: Row, d: Deps): Promise<Out> {
  if (row.status === "withdrawn") return out(200, { ok: true, status: "withdrawn" });
  const up = await d.updateRow(row.id, {
    status: "withdrawn", withdrawn_at: d.now().toISOString(), photo_path: null,
  });
  if (up.error) return out(500, { error: "save_failed" });
  if (row.photo_path) await d.deletePhoto(row.photo_path);
  return out(200, { ok: true, status: "withdrawn" });
}
