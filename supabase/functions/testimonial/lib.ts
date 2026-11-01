// Logica pura de la Edge Function `testimonial` (sin imports remotos, para poder probarla
// con `node --test supabase/functions/testimonial/lib.test.ts` o `deno test`).

export const LIMITS = {
  name: [2, 80],
  role: [2, 100],
  location: [2, 100],
  quote: [60, 1500],
  email: [5, 200],
} as const;

export const MAX_PHOTO_BYTES = 400 * 1024; // la foto llega ya recortada y reducida desde el navegador
export const MIN_FILL_MS = 2000;           // un humano tarda mas que esto en llenar el formulario
export const MAX_PER_IP_PER_DAY = 3;

export type Lang = "es" | "en";
export type Fields = {
  name: string; email: string; role: string; location: string; quote: string;
  lang: Lang; consent: boolean;
};
export type Validation =
  | { ok: true; value: Fields }
  | { ok: false; fields: Record<string, string> };

/** Una sola linea: sin saltos ni caracteres de control, espacios colapsados. */
export function cleanLine(v: unknown): string {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Texto libre: conserva parrafos, quita caracteres de control. */
export function cleanText(v: unknown): string {
  return String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isEmail(s: string): boolean {
  return s.length <= 200 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(s);
}

const LINK = /(https?:\/\/|www\.)/gi;

/** Valida y normaliza. Devuelve codigos de error por campo (el navegador los traduce). */
export function validate(b: Record<string, unknown>): Validation {
  const fields: Record<string, string> = {};
  const name = cleanLine(b.name);
  const email = cleanLine(b.email).toLowerCase();
  const role = cleanLine(b.role);
  const location = cleanLine(b.location);
  const quote = cleanText(b.quote);
  const lang: Lang = b.lang === "en" ? "en" : "es";

  const range = (key: "name" | "role" | "location" | "quote", val: string) => {
    const [min, max] = LIMITS[key];
    if (!val) fields[key] = "required";
    else if (val.length < min) fields[key] = "too_short";
    else if (val.length > max) fields[key] = "too_long";
  };
  range("name", name);
  range("role", role);
  range("location", location);
  range("quote", quote);

  if (!email) fields.email = "required";
  else if (!isEmail(email)) fields.email = "invalid_email";

  // sin enlaces en los campos cortos y maximo uno en el texto: frena el spam
  for (const [k, v] of [["name", name], ["role", role], ["location", location]] as const) {
    if (!fields[k] && LINK.test(v)) fields[k] = "links";
    LINK.lastIndex = 0;
  }
  if (!fields.quote && (quote.match(LINK) || []).length > 1) fields.quote = "links";
  LINK.lastIndex = 0;

  if (b.consent !== true) fields.consent = "required";

  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, value: { name, email, role, location, quote, lang, consent: true } };
}

export type Photo = { bytes: Uint8Array; ext: "jpg" | "png" | "webp"; mime: string };

/** Detecta el tipo real por sus primeros bytes (no confia en lo que diga el cliente). */
export function sniff(b: Uint8Array): Photo["ext"] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

const MIME: Record<Photo["ext"], string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** data:image/...;base64,.... -> bytes validados. Errores: photo_invalid | photo_too_large */
export function parsePhoto(dataUrl: unknown): { ok: true; photo: Photo } | { ok: false; error: string } {
  if (typeof dataUrl !== "string") return { ok: false, error: "photo_invalid" };
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:image/") || comma < 0 || !dataUrl.slice(0, comma).endsWith(";base64")) {
    return { ok: false, error: "photo_invalid" };
  }
  const b64 = dataUrl.slice(comma + 1);
  if (b64.length > Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 8) return { ok: false, error: "photo_too_large" };
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, error: "photo_invalid" };
  }
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: "photo_too_large" };
  const ext = sniff(bytes);
  if (!ext) return { ok: false, error: "photo_invalid" };
  return { ok: true, photo: { bytes, ext, mime: MIME[ext] } };
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Token del enlace privado: 32 bytes aleatorios en base64url (256 bits). */
export function newToken(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  let s = "";
  for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function looksLikeToken(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
}

/** Solo se aceptan paginas de nuestros dominios: el enlace llega por correo y no puede apuntar a otro sitio. */
export function safeBase(base: unknown, allowed: string[]): string | null {
  if (typeof base !== "string") return null;
  try {
    const u = new URL(base);
    if (u.protocol !== "https:" || !allowed.includes(u.origin)) return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

export function manageUrl(base: string, token: string, lang: Lang): string {
  return `${base}?edit=${token}#${lang === "en" ? "share" : "comparte"}`;
}

export function publicPhotoUrl(supabaseUrl: string, path: string | null): string | null {
  return path ? `${supabaseUrl}/storage/v1/object/public/testimonial-photos/${path}` : null;
}

export function escHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
