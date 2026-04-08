// Edge Function: coach-maat
// Proxy seguro entre el frontend y Mistral API
//
// Flujo:
// 1. Verifica JWT del usuario
// 2. Lee ai_config (system_prompt + api_key) con service_role
// 3. Llama a Mistral API (mistral-large-latest, max_tokens: 600)
// 4. Retorna la respuesta al frontend
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
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's JWT to verify identity
    const sbUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await sbUser.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request body
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Read ai_config with service_role (bypasses RLS)
    const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: config, error: configError } = await sbAdmin
      .from("ai_config")
      .select("system_prompt, api_key")
      .eq("id", 1)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: "AI config not found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = config.api_key;
    if (!apiKey || apiKey === "sk-placeholder") {
      return new Response(
        JSON.stringify({ error: "API key not configured. Contact admin." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Build messages for Mistral (OpenAI-compatible format)
    const mistralMessages: { role: string; content: string }[] = [];

    // System prompt as first message
    if (config.system_prompt) {
      mistralMessages.push({
        role: "system",
        content: config.system_prompt,
      });
    }

    // User/assistant messages (last 20, max 2000 chars each)
    messages.slice(-20).forEach((m: { role: string; content: string }) => {
      mistralMessages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content.slice(0, 2000),
      });
    });

    // 5. Call Mistral API
    const mistralResp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        max_tokens: 600,
        messages: mistralMessages,
      }),
    });

    if (!mistralResp.ok) {
      const errBody = await mistralResp.text();
      console.error("Mistral API error:", mistralResp.status, errBody);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mistralData = await mistralResp.json();
    const reply =
      mistralData.choices?.[0]?.message?.content || "No pude generar una respuesta.";

    // 6. Return response
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("coach-maat error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
