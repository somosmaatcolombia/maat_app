// Edge Function: coach-maat (con streaming SSE)
// Proxy seguro entre el frontend y Mistral API.
// Devuelve los tokens de Mistral en tiempo real al cliente para que la
// respuesta aparezca como si la escribiera en vivo.
//
// Flujo:
// 1. Verifica JWT del usuario
// 2. Lee ai_config (system_prompt + api_key) con service_role
// 3. Llama a Mistral con stream:true y reenvia el stream SSE al cliente
//
// Compatibilidad: si el body trae { stream:false } responde el JSON viejo.
//
// Deploy: supabase functions deploy coach-maat

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonErr("No authorization header", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sbUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await sbUser.auth.getUser();
    if (authError || !user) return jsonErr("Invalid or expired token", 401);

    // 2. Parse request
    const body = await req.json();
    const { messages, stream = true } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonErr("messages array is required", 400);
    }

    // 3. Read ai_config
    const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: config } = await sbAdmin
      .from("ai_config")
      .select("system_prompt, api_key")
      .eq("id", 1)
      .single();

    if (!config) return jsonErr("AI config not found", 500);
    const apiKey = config.api_key;
    if (!apiKey || apiKey === "sk-placeholder") {
      return jsonErr("API key not configured. Contact admin.", 503);
    }

    // 4. Build messages
    const mistralMessages: { role: string; content: string }[] = [];
    if (config.system_prompt) {
      mistralMessages.push({ role: "system", content: config.system_prompt });
    }

    // 4b. CONTEXTO DEL CLIENTE — sin esto el coach solo puede dar consejos
    // genericos, que es justo lo que el prompt le prohibe. Se inyecta como un
    // segundo mensaje de sistema para que pese sobre la conversacion.
    try {
      const ctx = await buildClientContext(sbAdmin, user.id);
      if (ctx) mistralMessages.push({ role: "system", content: ctx });
    } catch (e) {
      console.error("contexto del cliente fallo (sigo sin el):", e);
    }
    messages.slice(-20).forEach((m: { role: string; content: string }) => {
      mistralMessages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: (m.content || "").slice(0, 2000),
      });
    });

    // 5. Call Mistral
    const mistralResp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Medido 26-ago-2026 (tiempo hasta la primera palabra, streaming):
        //   mistral-large-latest  3.4 s
        //   mistral-medium-latest 0.5 s  <- elegido
        // Con el contexto del cliente inyectado, medium tiene material real
        // con que trabajar; la diferencia de capacidad pesa menos que 7x de
        // velocidad en un chat de acompaniamiento.
        model: "mistral-medium-latest",
        max_tokens: 600,
        stream,
        messages: mistralMessages,
      }),
    });

    if (!mistralResp.ok) {
      const errBody = await mistralResp.text();
      console.error("Mistral API error:", mistralResp.status, errBody);
      return jsonErr("AI service error", 502);
    }

    // 6a. Streaming: passthrough SSE chunks al cliente
    if (stream && mistralResp.body) {
      return new Response(mistralResp.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no", // evita buffering proxy
        },
      });
    }

    // 6b. No-stream: comportamiento original (JSON)
    const data = await mistralResp.json();
    const reply = data.choices?.[0]?.message?.content || "No pude generar una respuesta.";
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("coach-maat error:", err);
    return jsonErr("Internal server error", 500);
  }
});

function jsonErr(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ─────────────────── CONTEXTO DEL CLIENTE ───────────────────
   Arma una ficha compacta del cliente para que el coach hable CON el, no
   AL vacio: en que fase va, quien declaro ser (statement), su temperamento,
   como cerro sus ultimos dias y en que creencias esta trabajando.
   Todo con service_role porque el coach necesita leer datos del propio
   usuario autenticado (ya validado arriba con su JWT).                     */

const FASES: Record<number, string> = {
  1: "Fase 1 GRATITUD (semanas 1-4) — despertar la conciencia, descubrir lo que se evita",
  2: "Fase 2 AMOR (semanas 5-8) — reescribir creencias limitantes",
  3: "Fase 3 INTENCION (semanas 9-12) — reconstruir desde la voluntad consciente",
  4: "Fase 4 VOLUNTAD (semanas 13-16) — integrar la nueva identidad como habito",
};
const BIOTIPOS: Record<string, string> = {
  s: "Sanguineo (aire) — entusiasta y conector; su sombra es la dispersion y dejar cosas a medias",
  c: "Colerico (fuego) — decidido y orientado a la meta; su sombra es el control y la impaciencia",
  m: "Melancolico (tierra) — profundo y busca sentido; su sombra es la autoexigencia y la rumiacion",
  f: "Flematico (agua) — sereno y sostenedor; su sombra es la inercia y evitar el conflicto",
};

// deno-lint-ignore no-explicit-any
async function buildClientContext(sb: any, userId: string): Promise<string | null> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [pRes, sRes, cRes, hRes, bRes] = await Promise.all([
    sb.from("profiles").select("full_name, current_week, biotype_primary").eq("id", userId).maybeSingle(),
    sb.from("statement_hipnosis").select("statement").eq("user_id", userId).maybeSingle(),
    sb.from("calibrations")
      .select("date, coherence, did_text, missing_text, gratitude_text, learning_text, tomorrow_priority, priority_done, created_at")
      .eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(5),
    sb.from("habit_tracker").select("week, habits, intention").eq("user_id", userId)
      .order("week", { ascending: false }).limit(1),
    sb.from("beliefs").select("text, category").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(4),
  ]);

  const p = pRes.data;
  if (!p) return null;

  const semana = p.current_week ?? null;
  const faseN = !semana ? null : semana <= 4 ? 1 : semana <= 8 ? 2 : semana <= 12 ? 3 : 4;
  const L: string[] = [];

  L.push("CONTEXTO REAL DE LA PERSONA CON LA QUE HABLAS (no lo recites; usalo para no dar consejos genericos).");
  L.push(`Nombre: ${p.full_name ?? "sin nombre"}.`);
  if (semana) L.push(`Va en la semana ${semana} de 16 — ${faseN ? FASES[faseN] : ""}.`);
  if (p.biotype_primary && BIOTIPOS[p.biotype_primary]) {
    L.push(`Su biotipo es ${BIOTIPOS[p.biotype_primary]}. Ajusta como le hablas a ese temperamento.`);
  }
  if (sRes.data?.statement) {
    L.push(`Su statement (la identidad que eligio): "${sRes.data.statement}". Puedes devolvérselo cuando pierda el rumbo.`);
  }

  const cierres = cRes.data ?? [];
  if (cierres.length) {
    const cohs = cierres.map((r: { coherence: number | null }) => r.coherence).filter((n: number | null): n is number => n != null);
    const avg = cohs.length ? (cohs.reduce((a: number, b: number) => a + b, 0) / cohs.length).toFixed(1) : "—";
    const dias = Math.round((Date.now() - new Date(cierres[0].created_at).getTime()) / 86_400_000);
    L.push(`Cerro su dia ${cierres.length} vez/veces en las ultimas 2 semanas; coherencia promedio ${avg}/10. Ultimo cierre hace ${dias} dia(s).`);
    L.push("Sus ultimos cierres (lo que ESCRIBIO, en sus palabras):");
    for (const r of cierres.slice(0, 3)) {
      const bits = [
        r.did_text && `hizo: ${r.did_text}`,
        r.missing_text && `le falto: ${r.missing_text}`,
        r.gratitude_text && `agradecio: ${r.gratitude_text}`,
        r.learning_text && `aprendio: ${r.learning_text}`,
        r.tomorrow_priority && `se propuso: ${r.tomorrow_priority}`,
        r.priority_done && `cumplio lo del dia anterior: ${r.priority_done}`,
      ].filter(Boolean);
      if (bits.length) L.push(`  - ${r.date ?? ""} (coherencia ${r.coherence ?? "—"}): ${bits.join(" | ")}`);
    }
  } else {
    L.push("No ha cerrado ningun dia en las ultimas 2 semanas. Si aparece, no lo regañes: reconoce que volvio.");
  }

  const ht = (hRes.data ?? [])[0];
  if (ht?.intention) L.push(`Su intencion para la semana ${ht.week}: "${ht.intention}".`);
  if (Array.isArray(ht?.habits) && ht.habits.length) {
    L.push(`Habitos que eligio: ${ht.habits.map((h: { name?: string }) => h?.name).filter(Boolean).join(", ")}.`);
  }

  const bel = bRes.data ?? [];
  if (bel.length) {
    L.push(`Creencias que ha registrado: ${bel.map((b: { text: string; category: string }) => `"${b.text}" (${b.category})`).join("; ")}.`);
  }

  L.push("Usa esto para hablarle de SU proceso concreto. Si notas un patron entre lo que escribe y lo que dice ahora, nombralo con delicadeza.");
  return L.join("\n");
}
