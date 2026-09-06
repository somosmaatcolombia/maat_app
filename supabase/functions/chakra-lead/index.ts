// Edge Function: chakra-lead
// Puerta de entrada del "Viaje a los 7 Chakras": recibe los datos del visitante,
// los guarda en MAAT (chakra_leads) y los empuja al CRM, que es OTRO proyecto Supabase.
//
// Por que una funcion y no un insert directo desde la pagina:
//   MAAT (pcclptmojjzqmfmzftot) y el CRM (vbfesmgxegxsurnfazjs) son proyectos
//   SEPARADOS. Escribir en el CRM necesita su service_role key, que jamas puede
//   viajar al navegador. La funcion es el unico puente seguro.
//
// Contrato:
//   a) alta:    POST {name, email, whatsapp?, consent, lang?, source?, utm?, referrer?}
//               -> 200 {ok:true, lead_id, crm:"inserted"|"duplicate"|"skipped"|"error:..."}
//   b) escaneo:    POST {op:"scan", lead_id?|email, scores, focus, focus_es}
//   c) resonancia: POST {op:"resonance", lead_id?|email, chakra, chakra_es, hz}
//   d) sello:      POST {op:"seal", lead_id?|email, chakra, chakra_es, kind, seal_id}
//               -> 200 {ok:true, lead_id}
//      El resultado del escaneo se guarda en chakra_leads.meta y, si el prospect
//      existe en el CRM, se anota alli: saber que centro esta apagado es la mejor
//      primera frase de una conversacion de venta.
// El lead se guarda SIEMPRE. Si el CRM falla, la respuesta sigue siendo 200:
// perder el lead por un problema del CRM seria el peor de los dos errores.
//
// Auth: publica (visitantes sin cuenta). Deploy SIN verificacion de JWT:
//   supabase link --project-ref pcclptmojjzqmfmzftot
//   supabase functions deploy chakra-lead --no-verify-jwt
//
// Secrets requeridos (supabase secrets set ...):
//   CRM_URL          https://vbfesmgxegxsurnfazjs.supabase.co
//   CRM_SERVICE_KEY  service_role key del proyecto CRM
// Opcionales:
//   CRM_TABLE        tabla destino (default: prospects)
//   CRM_ADVISOR_ID   uuid del asesor dueno de estos leads (si la tabla lo exige)
//   CRM_STAGE_ID     etapa inicial del pipeline (si la tabla lo exige)
//   CRM_SOURCE       etiqueta de origen (default: "Chakras")

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const email = String(b.email ?? "").trim().toLowerCase();
  const op = String(b.op ?? "lead");
  const name = String(b.name ?? "").trim();
  const whatsapp = b.whatsapp ? String(b.whatsapp).trim() : null;

  // en el escaneo basta con el lead_id; en el alta el correo es obligatorio
  const needsEmail = !["scan", "resonance", "seal"].includes(op) || !b.lead_id;
  if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Email invalido" }, 400);
  }

  // ---------- cliente de MAAT (service role: el lead nunca depende del RLS) ----------
  const maat = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  // ---------- 1b · escaneo: enriquece el lead que ya existe ----------
  if (op === "scan" || op === "resonance" || op === "seal") {
    // resolvemos el lead por id o, en su defecto, por el correo mas reciente
    let target: { id: string; email: string } | null = null;
    if (b.lead_id) {
      const { data } = await maat.from("chakra_leads")
        .select("id, email").eq("id", String(b.lead_id)).maybeSingle();
      target = data as typeof target;
    } else if (email) {
      const { data } = await maat.from("chakra_leads")
        .select("id, email").eq("email", email)
        .order("created_at", { ascending: false }).limit(1);
      target = (data && data[0]) as typeof target;
    }
    if (!target) return json({ ok: false, error: "lead no encontrado" }, 404);

    // meta se FUSIONA: el escaneo y las resonancias conviven en el mismo lead
    const { data: prev } = await maat.from("chakra_leads")
      .select("meta").eq("id", target.id).maybeSingle();
    const meta: Record<string, unknown> = { ...(prev?.meta ?? {}) };
    const at = new Date().toISOString();
    if (op === "scan") {
      meta.scan = { scores: b.scores ?? null, focus: b.focus ?? null, at };
    } else if (op === "seal") {
      const sellos = Array.isArray(meta.seals) ? meta.seals : [];
      sellos.push({ chakra: b.chakra ?? null, kind: b.kind ?? null, seal_id: b.seal_id ?? null, at });
      meta.seals = sellos.slice(-50);          // historial acotado
    } else {
      const voz = (meta.resonance ?? {}) as Record<string, unknown>;
      voz[String(b.chakra ?? "?")] = { hz: b.hz ?? null, at };
      meta.resonance = voz;
    }
    const { error: upErr } = await maat.from("chakra_leads").update({ meta }).eq("id", target.id);
    if (upErr) return json({ error: upErr.message }, 500);

    // el CRM se entera de por donde entrar a la conversacion
    const CRM_U = Deno.env.get("CRM_URL"), CRM_K = Deno.env.get("CRM_SERVICE_KEY");
    const T = Deno.env.get("CRM_TABLE") ?? "prospects";
    if (CRM_U && CRM_K && target.email) {
      const note = op === "seal"
        ? `Sesion completada en ${b.chakra_es ?? b.chakra} (${b.kind}). Sello ${b.seal_id}.`
        : op === "scan"
        ? `Escaneo de chakras: centro con menos luz = ${b.focus_es ?? b.focus}. ` +
          `Puntajes (0 = apagado, 100 = encendido): ${JSON.stringify(b.scores ?? {})}`
        : `Resonancia de voz lograda en ${b.chakra_es ?? b.chakra} a ${b.hz} Hz.`;
      try {
        await fetch(`${CRM_U}/rest/v1/${T}?email=eq.${encodeURIComponent(target.email)}`, {
          method: "PATCH",
          headers: { apikey: CRM_K, Authorization: `Bearer ${CRM_K}`, "Content-Type": "application/json" },
          body: JSON.stringify({ notes: note }),
        });
      } catch (_e) { /* best-effort: el escaneo ya quedo guardado en MAAT */ }
    }
    return json({ ok: true, lead_id: target.id });
  }

  // ---------- 1 · alta del lead ----------
  const row = {
    name: name || null,
    email,
    whatsapp,
    consent: b.consent === true,
    lang: String(b.lang ?? "es"),
    source: String(b.source ?? "chakras"),
    utm: b.utm ?? null,
    referrer: b.referrer ? String(b.referrer).slice(0, 500) : null,
  };
  const { data: lead, error: leadErr } = await maat
    .from("chakra_leads").insert(row).select("id").single();
  if (leadErr) return json({ error: leadErr.message }, 500);

  // ---------- 2 · puente al CRM (best-effort) ----------
  let crm = "skipped";
  let crmId: string | null = null;
  const CRM_URL = Deno.env.get("CRM_URL");
  const CRM_KEY = Deno.env.get("CRM_SERVICE_KEY");
  const TABLE = Deno.env.get("CRM_TABLE") ?? "prospects";

  if (CRM_URL && CRM_KEY) {
    const h = {
      apikey: CRM_KEY,
      Authorization: `Bearer ${CRM_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    try {
      // 2a · deduplicar por correo: el CRM manda sobre lo que ya sabe de esa persona
      const dup = await fetch(
        `${CRM_URL}/rest/v1/${TABLE}?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
        { headers: h },
      );
      const dupRows = dup.ok ? await dup.json() : [];
      if (Array.isArray(dupRows) && dupRows.length) {
        crm = "duplicate";
        crmId = dupRows[0]?.id ?? null;
      } else {
        // 2b · insert con auto-correccion de columnas.
        // No conocemos de memoria el esquema exacto de prospects: si PostgREST
        // responde "no existe la columna X", la quitamos y reintentamos.
        const payload: Record<string, unknown> = {
          name: name || email,
          email,
          phone: whatsapp,
          source: Deno.env.get("CRM_SOURCE") ?? "Chakras",
          notes: `Lead del Viaje a los 7 Chakras (${row.lang}). Consentimiento: ${row.consent ? "si" : "no"}.`,
        };
        const advisor = Deno.env.get("CRM_ADVISOR_ID");
        const stage = Deno.env.get("CRM_STAGE_ID");
        if (advisor) payload.advisor_id = advisor;
        if (stage) payload.stage_id = stage;

        let attempt = 0, done = false, lastMsg = "";
        while (attempt < 6 && !done) {
          attempt++;
          const res = await fetch(`${CRM_URL}/rest/v1/${TABLE}`, {
            method: "POST", headers: h, body: JSON.stringify(payload),
          });
          if (res.ok) {
            const rows = await res.json().catch(() => []);
            crmId = Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : null;
            crm = "inserted";
            done = true;
            break;
          }
          const txt = await res.text();
          lastMsg = txt.slice(0, 300);
          // PGRST204: "Could not find the 'x' column of 'prospects' in the schema cache"
          const miss = txt.match(/'([^']+)' column/) ?? txt.match(/column "([^"]+)"/);
          if (miss && miss[1] && miss[1] in payload) { delete payload[miss[1]]; continue; }
          crm = `error:${lastMsg}`;
          done = true;
        }
        if (!done) crm = `error:${lastMsg || "sin respuesta del CRM"}`;
      }
    } catch (e) {
      crm = `error:${(e as Error).message}`;
    }
  }

  await maat.from("chakra_leads").update({ crm_status: crm, crm_id: crmId }).eq("id", lead.id);
  return json({ ok: true, lead_id: lead.id, crm });
});
