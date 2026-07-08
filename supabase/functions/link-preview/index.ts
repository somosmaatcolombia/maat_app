// Edge Function: link-preview
// Obtiene los metadatos Open Graph (titulo, imagen, descripcion) de un enlace
// que un miembro comparte en Comuni-Maat. Corre en el servidor porque el
// navegador no puede leer paginas de otros dominios (CORS).
//
// Auth: JWT de usuario MAAT (verify-jwt ON, default del gateway).
// Body: { url }  ->  { title, image, description, domain }
// La vista previa se guarda en el post al publicar (no se re-consulta por render).
//
// Deploy: supabase functions deploy link-preview
//   (SIN --no-verify-jwt: solo usuarios logueados pueden usarla)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hosts privados/infra: nunca visitarlos (anti-SSRF)
const BLOCKED_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|metadata\.|.*\.internal$)/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // ---- Solo usuarios autenticados de MAAT ----
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const sbUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const b = await req.json().catch(() => ({}));
    let target: URL;
    try {
      target = new URL(String(b.url || ""));
    } catch (_) {
      return json({ error: "URL invalida" }, 400);
    }
    if (!/^https?:$/.test(target.protocol)) return json({ error: "Solo http/https" }, 400);
    if (target.port && !["80", "443"].includes(target.port)) return json({ error: "Puerto no permitido" }, 400);
    if (BLOCKED_HOST.test(target.hostname)) return json({ error: "Host no permitido" }, 400);

    const domain = target.hostname.replace(/^www\./, "");
    const fallback = { title: null as string | null, image: null as string | null, description: null as string | null, domain };

    // ---- Descargar la pagina (timeout 6s, solo HTML, primeros ~300KB) ----
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(target.href, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MaatLinkPreview/1.0; +https://somosmaat.org)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
    } catch (_) {
      clearTimeout(timer);
      return json(fallback, 200); // no se pudo visitar: el post sale con tarjeta de dominio
    }
    clearTimeout(timer);
    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("html")) return json(fallback, 200);

    const html = (await res.text()).slice(0, 300000);

    // ---- Extraer metadatos ----
    const title = meta(html, ["og:title", "twitter:title"]) || plainTitle(html);
    let image = meta(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
    const description = meta(html, ["og:description", "twitter:description", "description"]);

    // Imagen relativa -> absoluta contra la URL final (tras redirects)
    if (image) {
      try { image = new URL(image, res.url || target.href).href; } catch (_) { image = null; }
      if (image && !/^https?:\/\//.test(image)) image = null;
    }

    return json({
      title: title ? decodeEntities(title).slice(0, 200) : null,
      image,
      description: description ? decodeEntities(description).slice(0, 300) : null,
      domain,
    }, 200);
  } catch (err) {
    console.error("link-preview error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Busca <meta property|name="X" content="..."> en ambos ordenes de atributos.
function meta(html: string, names: string[]): string | null {
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + esc + '["\'][^>]*content=["\']([^"\']*)["\']', "i"));
    if (!m) m = html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + esc + '["\']', "i"));
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function plainTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  return m ? m[1].trim() : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d)));
}
