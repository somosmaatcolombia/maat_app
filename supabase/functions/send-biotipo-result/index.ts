// Edge Function: send-biotipo-result
// Envia por correo (SMTP de cPanel) el resultado del cuestionario de Biotipo
// a un visitante que dejo su email al final del test (src/maat_biotipo.html).
//
// El CONTENIDO ya viene localizado (es/en) desde el cliente en `render`, para
// no duplicar los perfiles de biotipo aqui: el HTML del quiz es la unica fuente
// de verdad. Esta funcion solo arma el email y lo despacha.
//
// El lead ya se guarda en biotype_leads desde el cliente; aqui NO se re-inserta
// (si el SMTP falla, el lead igual quedo capturado).
//
// Auth: publica (visitantes sin cuenta). Deploy SIN verificacion de JWT:
//   supabase functions deploy send-biotipo-result --no-verify-jwt
//
// Secrets requeridos (supabase secrets set ...):
//   SMTP_HOST      ej: mail.somosmaat.org
//   SMTP_PORT      465 (SSL) o 587 (STARTTLS)
//   SMTP_USERNAME  buzon completo, ej: hola@somosmaat.org
//   SMTP_PASSWORD  clave del buzon
//   SMTP_FROM      remitente, ej: MAAT <hola@somosmaat.org>
//   SMTP_SECURE    "true" para puerto 465 (default), "false" para 587

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const b = await req.json().catch(() => ({}));
    const email: string = (b.email || "").toString().trim();
    const name: string = (b.name || "").toString().trim();
    const render = b.render || {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Email invalido" }, 400);
    }

    const host = Deno.env.get("SMTP_HOST") || "";
    const port = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const user = Deno.env.get("SMTP_USERNAME") || "";
    const pass = Deno.env.get("SMTP_PASSWORD") || "";
    const from = Deno.env.get("SMTP_FROM") || user;
    const secure = (Deno.env.get("SMTP_SECURE") || "true") === "true";
    if (!host || !user || !pass) return json({ error: "SMTP no configurado" }, 503);

    const subject: string = (render.subject || "Tu Biotipo MAAT").toString();
    const html = buildHtml(name, render);
    const text = buildText(name, render);

    const client = new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: secure, // 465 -> tls directo; 587 -> false (STARTTLS lo negocia denomailer)
        auth: { username: user, password: pass },
      },
    });

    try {
      await client.send({ from, to: email, subject, html, content: text });
    } finally {
      await client.close();
    }

    return json({ ok: true, sent: true }, 200);
  } catch (err) {
    console.error("send-biotipo-result error:", err);
    return json({ error: "No se pudo enviar el correo" }, 500);
  }
});

// ---- Plantilla de correo (tablas + estilos inline por compatibilidad) ----
function buildHtml(name: string, r: Record<string, unknown>): string {
  const purple = "#896C8E", ink = "#2a2030", ink2 = "#5a4f5e", paper = "#fdfaf6", paper2 = "#f5efe6";
  const primaryHex = (r.primaryHex as string) || purple;
  const greeting = (r.greeting as string) || (name ? `Hola ${name},` : "Hola,");
  const intro = (r.intro as string) || "";
  const primaryName = (r.primaryName as string) || "";
  const secondaryName = (r.secondaryName as string) || "";
  const poetic = (r.poetic as string) || "";
  const secondLabel = (r.secondLabel as string) || "Con un segundo dominante";
  const logo = (r.logo as string) || "";
  const heroImg = (r.heroImg as string) || "";
  const badgeImg = (r.badgeImg as string) || "";
  const spectrum = Array.isArray(r.spectrum) ? r.spectrum as Array<Record<string, unknown>> : [];
  const sections = Array.isArray(r.sections) ? r.sections as Array<Record<string, unknown>> : [];
  const spectrumTitle = (r.spectrumTitle as string) || "";
  const bridgeTitle = (r.bridgeTitle as string) || "";
  const bridgeText = (r.bridgeText as string) || "";
  const ctaLabel = (r.ctaLabel as string) || "";
  const ctaUrl = (r.ctaUrl as string) || "";
  const ps = (r.ps as string) || "";
  const footer = (r.footer as string) || "";

  const logoImg = logo
    ? `<img src="${esc(logo)}" width="44" height="44" alt="MAAT" style="border-radius:12px;display:inline-block;background:#fff;">`
    : `<div style="font:700 20px Arial,sans-serif;letter-spacing:4px;color:#fff;">MAAT</div>`;

  const medallion = heroImg
    ? `<img src="${esc(heroImg)}" width="128" height="128" alt="${esc(primaryName)}" style="border-radius:64px;border:4px solid rgba(255,255,255,.75);display:block;margin:0 auto;background:#fff;">`
    : "";

  const bars = spectrum.map((s) => {
    const pct = Math.max(2, Math.min(100, Number(s.pct) || 0));
    const hex = esc((s.hex as string) || purple);
    return `<tr>
      <td style="padding:6px 0 3px;font:600 13px Arial,sans-serif;color:${ink};">${esc((s.name as string) || "")}
        <span style="float:right;color:#8a7d8c;">${pct}%</span></td></tr>
      <tr><td style="padding:0 0 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0e9df;border-radius:6px;">
          <tr><td style="background:${hex};height:10px;line-height:10px;font-size:0;border-radius:6px;width:${pct}%;">&nbsp;</td>
              <td style="width:${100 - pct}%;">&nbsp;</td></tr>
        </table></td></tr>`;
  }).join("");

  const secs = sections.map((s) => `
    <tr><td style="padding:18px 0 5px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:8px;height:8px;background:${primaryHex};border-radius:8px;font-size:0;">&nbsp;</td>
        <td style="padding-left:9px;font:700 17px Arial,sans-serif;color:${primaryHex};">${esc((s.title as string) || "")}</td>
      </tr></table></td></tr>
    <tr><td style="padding:0 0 6px;font:400 15px/1.65 Arial,sans-serif;color:${ink2};">${esc((s.text as string) || "")}</td></tr>`).join("");

  const badge = badgeImg
    ? `<img src="${esc(badgeImg)}" width="58" height="58" alt="${esc(secondaryName)}" style="border-radius:29px;border:2px solid rgba(255,255,255,.8);display:block;margin:0 auto 10px;background:#fff;">`
    : "";

  const cta = ctaUrl && ctaLabel ? `
    <tr><td align="center" style="padding:22px 0 4px;">
      <a href="${esc(ctaUrl)}" style="background:${purple};color:#fff;text-decoration:none;font:600 16px Arial,sans-serif;padding:15px 38px;border-radius:28px;display:inline-block;">${esc(ctaLabel)} &rarr;</a>
    </td></tr>` : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:${paper};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(primaryName)} + ${esc(secondaryName)} &mdash; ${esc(poetic)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(42,32,48,.08);">

        <tr><td align="center" style="background:${primaryHex};padding:26px 30px 30px;">
          ${logoImg}
          <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
          ${medallion}
          <div style="font:700 12px Arial,sans-serif;letter-spacing:3px;color:rgba(255,255,255,.9);text-transform:uppercase;margin-top:16px;">Tu biotipo principal</div>
          <div style="font:700 36px Arial,sans-serif;color:#fff;margin:6px 0 4px;">${esc(primaryName)}</div>
          <div style="font:italic 400 16px Arial,sans-serif;color:rgba(255,255,255,.92);">${esc(poetic)}</div>
          <div style="font:400 13px Arial,sans-serif;color:rgba(255,255,255,.85);margin-top:12px;">${esc(secondLabel)}: <b style="color:#fff;">${esc(secondaryName)}</b></div>
        </td></tr>

        <tr><td style="padding:28px 32px 4px;">
          <p style="font:400 15px/1.7 Arial,sans-serif;color:${ink};margin:0 0 8px;">${esc(greeting)}</p>
          ${intro ? `<p style="font:400 15px/1.7 Arial,sans-serif;color:${ink2};margin:0 0 18px;">${esc(intro)}</p>` : ""}
          ${spectrumTitle ? `<div style="font:700 12px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#8a7d8c;margin:6px 0 10px;">${esc(spectrumTitle)}</div>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bars}</table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${secs}</table>
        </td></tr>

        ${badgeImg || bridgeTitle ? `<tr><td style="padding:8px 32px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper2};border-radius:14px;">
            <tr><td align="center" style="padding:24px 26px;">
              ${badge}
              ${bridgeTitle ? `<div style="font:700 20px Arial,sans-serif;color:${ink};margin:0 0 8px;">${esc(bridgeTitle)}</div>` : ""}
              ${bridgeText ? `<div style="font:400 15px/1.7 Arial,sans-serif;color:${ink2};">${esc(bridgeText)}</div>` : ""}
              <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${cta ? `<table role="presentation" cellpadding="0" cellspacing="0">${cta}</table>` : ""}</td></tr></table>
            </td></tr>
          </table>
        </td></tr>` : cta ? `<tr><td align="center" style="padding:8px 32px 20px;"><table role="presentation" cellpadding="0" cellspacing="0">${cta}</table></td></tr>` : ""}

        <tr><td style="padding:22px 32px 30px;border-top:1px solid #f0e9df;">
          ${ps ? `<p style="font:italic 400 14px/1.6 Arial,sans-serif;color:${ink2};margin:0 0 14px;">${esc(ps)}</p>` : ""}
          <p style="font:400 12px/1.6 Arial,sans-serif;color:#8a7d8c;margin:0;">${esc(footer)}</p>
          <p style="font:400 12px/1.6 Arial,sans-serif;color:#b3a9b5;margin:10px 0 0;">MAAT &middot; <a href="https://somosmaat.org" style="color:#8a7d8c;">somosmaat.org</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table></body></html>`;
}

function buildText(name: string, r: Record<string, unknown>): string {
  const greeting = (r.greeting as string) || (name ? `Hola ${name},` : "Hola,");
  const lines = [greeting, ""];
  if (r.intro) lines.push((r.intro as string) || "", "");
  lines.push(
    `${(r.primaryName as string) || ""} - ${(r.poetic as string) || ""}`,
    `${(r.secondLabel as string) || "Segundo dominante"}: ${(r.secondaryName as string) || ""}`, "");
  const sections = Array.isArray(r.sections) ? r.sections as Array<Record<string, unknown>> : [];
  for (const s of sections) { lines.push((s.title as string) || "", (s.text as string) || "", ""); }
  if (r.bridgeTitle) lines.push((r.bridgeTitle as string) || "", (r.bridgeText as string) || "", "");
  if (r.ctaUrl) lines.push((r.ctaLabel as string) || "", (r.ctaUrl as string) || "", "");
  if (r.ps) lines.push((r.ps as string) || "", "");
  if (r.footer) lines.push((r.footer as string) || "");
  return lines.join("\n");
}

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
