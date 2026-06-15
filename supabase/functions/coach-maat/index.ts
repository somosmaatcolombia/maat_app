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
        model: "mistral-large-latest",
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
