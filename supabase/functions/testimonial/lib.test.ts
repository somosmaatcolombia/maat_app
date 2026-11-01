// Pruebas de lib.ts:  node --test supabase/functions/testimonial/lib.test.ts
//                 o:  deno test supabase/functions/testimonial/lib.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  validate, parsePhoto, sniff, newToken, looksLikeToken, safeBase, manageUrl, sha256Hex,
  cleanLine, cleanText, isEmail, publicPhotoUrl, MAX_PHOTO_BYTES,
} from "./lib.ts";

const QUOTE = "Llegue sintiendo que cumplia con todo y no me reconocia por dentro. Hoy decido con mas calma y cuido lo que me importa.";
const ok = () => ({
  name: "  Laura   Perez ", email: " Laura@Example.COM ", role: "Directora de operaciones",
  location: "Medellin, Colombia", quote: QUOTE, lang: "es", consent: true,
});

const dataUrl = (bytes: number[], mime = "image/jpeg") =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56];

test("validate: normaliza espacios y pasa el correo a minusculas", () => {
  const r = validate(ok());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.name, "Laura Perez");
    assert.equal(r.value.email, "laura@example.com");
    assert.equal(r.value.lang, "es");
  }
});

test("validate: campos obligatorios y limites", () => {
  const r = validate({ ...ok(), name: "", role: "x", quote: "muy corto", email: "no-es-correo" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.fields.name, "required");
    assert.equal(r.fields.role, "too_short");
    assert.equal(r.fields.quote, "too_short");
    assert.equal(r.fields.email, "invalid_email");
  }
  const long = validate({ ...ok(), quote: "a".repeat(1501) });
  assert.equal(long.ok, false);
  if (!long.ok) assert.equal(long.fields.quote, "too_long");
});

test("validate: sin autorizacion (consent) no se guarda nada", () => {
  for (const consent of [false, "true", 1, undefined]) {
    const r = validate({ ...ok(), consent });
    assert.equal(r.ok, false, `consent=${String(consent)} deberia fallar`);
  }
});

test("validate: enlaces = spam (0 en campos cortos, max 1 en el texto)", () => {
  const a = validate({ ...ok(), role: "Visita https://spam.example" });
  assert.equal(a.ok, false);
  const b = validate({ ...ok(), quote: QUOTE + " https://uno.example y www.dos.example" });
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.fields.quote, "links");
  const c = validate({ ...ok(), quote: QUOTE + " Mas en https://uno.example" });
  assert.equal(c.ok, true, "un solo enlace se tolera");
});

test("validate: idioma por defecto es y solo acepta es|en", () => {
  const en = validate({ ...ok(), lang: "en" });
  const fr = validate({ ...ok(), lang: "fr" });
  assert.equal(en.ok && en.value.lang, "en");
  assert.equal(fr.ok && fr.value.lang, "es");
});

test("clean: quita caracteres de control y conserva parrafos", () => {
  assert.equal(cleanLine("a\u0000b\nc\t d"), "a b c d");
  assert.equal(cleanText("uno\r\n\r\n\r\n\r\ndos\u0007"), "uno\n\ndos");
});

test("isEmail", () => {
  assert.ok(isEmail("a@b.co"));
  assert.ok(!isEmail("a@b"));
  assert.ok(!isEmail("a b@c.com"));
  assert.ok(!isEmail("<x>@y.com"));
});

test("sniff reconoce el tipo real por los bytes", () => {
  assert.equal(sniff(Uint8Array.from(JPG)), "jpg");
  assert.equal(sniff(Uint8Array.from(PNG)), "png");
  assert.equal(sniff(Uint8Array.from(WEBP)), "webp");
  assert.equal(sniff(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 1, 1, 1, 1, 1, 1])), null); // GIF
  assert.equal(sniff(Uint8Array.from([0x3c, 0x73, 0x76, 0x67, 0x3e, 0, 0, 0, 0, 0, 0, 0, 0])), null);    // SVG
});

test("parsePhoto acepta jpeg/png/webp reales", () => {
  for (const [bytes, mime, ext] of [[JPG, "image/jpeg", "jpg"], [PNG, "image/png", "png"], [WEBP, "image/webp", "webp"]] as const) {
    const r = parsePhoto(dataUrl([...bytes], mime));
    assert.equal(r.ok, true);
    if (r.ok) { assert.equal(r.photo.ext, ext); assert.equal(r.photo.mime, mime); }
  }
});

test("parsePhoto rechaza archivos disfrazados de imagen", () => {
  // un ejecutable/HTML/script con cabecera de imagen falsa
  const html = parsePhoto(dataUrl([...Buffer.from("<html><script>alert(1)</script></html>")], "image/jpeg"));
  assert.deepEqual(html, { ok: false, error: "photo_invalid" });
  const svg = parsePhoto(dataUrl([...Buffer.from("<svg onload=alert(1)></svg>")], "image/svg+xml"));
  assert.deepEqual(svg, { ok: false, error: "photo_invalid" });
  assert.deepEqual(parsePhoto("data:text/html;base64,PGI+"), { ok: false, error: "photo_invalid" });
  assert.deepEqual(parsePhoto("no-es-un-data-url"), { ok: false, error: "photo_invalid" });
  assert.deepEqual(parsePhoto(null), { ok: false, error: "photo_invalid" });
  assert.deepEqual(parsePhoto("data:image/jpeg;base64,@@@@"), { ok: false, error: "photo_invalid" });
});

test("parsePhoto rechaza fotos demasiado grandes", () => {
  const big = [...JPG, ...new Array(MAX_PHOTO_BYTES + 10).fill(1)];
  assert.deepEqual(parsePhoto(dataUrl(big)), { ok: false, error: "photo_too_large" });
});

test("token: 43 caracteres base64url, unico, y su hash es estable", async () => {
  const t1 = newToken(), t2 = newToken();
  assert.match(t1, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t1, t2);
  assert.ok(looksLikeToken(t1));
  assert.ok(!looksLikeToken("corto"));
  assert.ok(!looksLikeToken(t1 + "x"));
  assert.ok(!looksLikeToken(undefined));
  const h = await sha256Hex(t1);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await sha256Hex(t1));
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("safeBase: el enlace de gestion solo puede apuntar a nuestros dominios", () => {
  const allow = ["https://somosmaat.org", "https://v2.somosmaat.org"];
  assert.equal(safeBase("https://somosmaat.org/es/testimonios/?x=1#y", allow), "https://somosmaat.org/es/testimonios/");
  assert.equal(safeBase("https://v2.somosmaat.org/en/testimonials/", allow), "https://v2.somosmaat.org/en/testimonials/");
  assert.equal(safeBase("https://evil.example/es/testimonios/", allow), null);
  assert.equal(safeBase("https://somosmaat.org.evil.example/", allow), null);
  assert.equal(safeBase("http://somosmaat.org/es/", allow), null);
  assert.equal(safeBase("javascript:alert(1)", allow), null);
  assert.equal(safeBase(42, allow), null);
});

test("manageUrl y publicPhotoUrl", () => {
  assert.equal(manageUrl("https://somosmaat.org/es/testimonios/", "TOK", "es"), "https://somosmaat.org/es/testimonios/?edit=TOK#comparte");
  assert.equal(manageUrl("https://somosmaat.org/en/testimonials/", "TOK", "en"), "https://somosmaat.org/en/testimonials/?edit=TOK#share");
  assert.equal(publicPhotoUrl("https://x.supabase.co", "a.webp"), "https://x.supabase.co/storage/v1/object/public/testimonial-photos/a.webp");
  assert.equal(publicPhotoUrl("https://x.supabase.co", null), null);
});
