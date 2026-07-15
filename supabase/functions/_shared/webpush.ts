// Web Push NATIVO de Deno (solo Web Crypto + fetch).
//
// Reemplaza la libreria npm "web-push", que CRASHEA en el runtime de Supabase con:
//   "Deno.core.runMicrotasks() is not supported in this environment"
// (usa mecanismos de Node -process.nextTick- que el runtime ya no soporta).
// Por eso NINGUN push se entregaba, aunque el log dijera "enviado".
//
// @negrel/webpush esta construido para Deno/edge: cifra con Web Crypto y envia
// con fetch, sin dependencias de Node.

import * as webpush from "jsr:@negrel/webpush@0.5.0";

// ---- base64url helpers ----
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Convierte las llaves VAPID en base64url (formato clasico, como las guarda la app
// y los secrets) a JWK, que es lo que espera importVapidKeys().
//   VAPID_PUBLIC_KEY  = base64url de 65 bytes: 0x04 || X(32) || Y(32)
//   VAPID_PRIVATE_KEY = base64url de 32 bytes: d
function vapidBase64ToJwk(pub: string, priv: string) {
  const pk = b64urlToBytes(pub);
  const x = bytesToB64url(pk.slice(1, 33));
  const y = bytesToB64url(pk.slice(33, 65));
  const d = bytesToB64url(b64urlToBytes(priv));
  return {
    publicKey: { kty: "EC", crv: "P-256", x, y } as JsonWebKey,
    privateKey: { kty: "EC", crv: "P-256", x, y, d } as JsonWebKey,
  };
}

// deno-lint-ignore no-explicit-any
let _appServerPromise: Promise<any> | null = null;
// deno-lint-ignore no-explicit-any
function getAppServer(): Promise<any> {
  if (_appServerPromise) return _appServerPromise;
  _appServerPromise = (async () => {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const priv = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidKeys = await webpush.importVapidKeys(
      vapidBase64ToJwk(pub, priv),
      { extractable: false },
    );
    return await webpush.ApplicationServer.new({
      contactInformation: "mailto:hello@somosmaat.org",
      vapidKeys,
    });
  })();
  return _appServerPromise;
}

export interface PushResult { ok: boolean; status: number; }

// Envia UN push. Devuelve {ok, status}. status 404/410 => suscripcion muerta.
export async function sendPush(
  sub: { endpoint: string; p256dh: string; auth_key: string },
  payload: string,
): Promise<PushResult> {
  try {
    const appServer = await getAppServer();
    const subscriber = appServer.subscribe({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth_key },
    });
    await subscriber.pushTextMessage(payload, {});
    return { ok: true, status: 201 };
  } catch (err) {
    // @negrel/webpush lanza PushMessageError con .response (Response) en fallos HTTP.
    // deno-lint-ignore no-explicit-any
    const e = err as any;
    const status = e?.response?.status ?? e?.status ?? 0;
    if (!status) console.error("push error:", e?.message || e);
    return { ok: false, status };
  }
}
