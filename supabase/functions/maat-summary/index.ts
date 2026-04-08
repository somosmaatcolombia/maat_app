// Edge Function: maat-summary
// Genera resumen IA de un cliente para el mentor
//
// Flujo:
// 1. Verifica JWT + rol mentor/admin
// 2. Carga datos del cliente (calibraciones, habitos, creencias, etc.)
// 3. Construye prompt con contexto del cliente
// 4. Llama a Mistral API
// 5. Retorna resumen
//
// Deploy: supabase functions deploy maat-summary

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

    // Verify user + role
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

    // Check role is mentor or admin
    const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: mentorProfile } = await sbAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!mentorProfile || !["mentor", "admin"].includes(mentorProfile.role)) {
      return new Response(
        JSON.stringify({ error: "Only mentors and admins can generate summaries" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(
        JSON.stringify({ error: "client_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load ai_config
    const { data: config } = await sbAdmin
      .from("ai_config")
      .select("system_prompt, api_key")
      .eq("id", 1)
      .single();

    if (!config?.api_key || config.api_key === "sk-placeholder") {
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load client data in parallel
    const [profileRes, calsRes, beliefsRes, habitsRes, reflectionsRes] =
      await Promise.allSettled([
        sbAdmin.from("profiles").select("*").eq("id", client_id).single(),
        sbAdmin
          .from("calibrations")
          .select("*")
          .eq("user_id", client_id)
          .order("created_at", { ascending: false })
          .limit(10),
        sbAdmin
          .from("beliefs")
          .select("text, category")
          .eq("user_id", client_id)
          .order("created_at", { ascending: false })
          .limit(20),
        sbAdmin
          .from("habit_tracker")
          .select("week, habits, intention, learned, felt, belief")
          .eq("user_id", client_id)
          .order("week", { ascending: false })
          .limit(4),
        sbAdmin
          .from("phase_reflections")
          .select("phase_id, reflection")
          .eq("user_id", client_id),
      ]);

    const clientProfile =
      profileRes.status === "fulfilled" ? profileRes.value.data : null;
    const calibrations =
      calsRes.status === "fulfilled" ? calsRes.value.data || [] : [];
    const beliefs =
      beliefsRes.status === "fulfilled" ? beliefsRes.value.data || [] : [];
    const habits =
      habitsRes.status === "fulfilled" ? habitsRes.value.data || [] : [];
    const reflections =
      reflectionsRes.status === "fulfilled"
        ? reflectionsRes.value.data || []
        : [];

    if (!clientProfile) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context prompt
    const phase = Math.ceil((clientProfile.current_week || 1) / 4);
    const phaseNames = ["GRATITUD", "AMOR", "INTENCIÓN", "VOLUNTAD"];

    const contextParts = [
      `Cliente: ${clientProfile.full_name}`,
      `Semana: ${clientProfile.current_week}/16 — Fase ${phase}: ${phaseNames[phase - 1] || "?"}`,
    ];

    if (calibrations.length > 0) {
      const avgCoherence =
        calibrations.reduce(
          (sum: number, c: { coherence: number }) => sum + (c.coherence || 0),
          0
        ) / calibrations.length;
      contextParts.push(`Actitud promedio (últimas ${calibrations.length}): ${avgCoherence.toFixed(1)}/10`);
      contextParts.push(
        `Últimas calibraciones:\n` +
          calibrations
            .slice(0, 5)
            .map(
              (c: {
                date: string;
                coherence: number;
                answer_q1: string;
                answer_q2: string;
                answer_q3: string;
              }) =>
                `  ${c.date} (actitud ${c.coherence}/10): Q1=${(c.answer_q1 || "").slice(0, 80)} | Q2=${(c.answer_q2 || "").slice(0, 80)} | Q3=${(c.answer_q3 || "").slice(0, 80)}`
            )
            .join("\n")
      );
    } else {
      contextParts.push("Sin calibraciones registradas.");
    }

    if (beliefs.length > 0) {
      contextParts.push(
        `Creencias (${beliefs.length}):\n` +
          beliefs
            .slice(0, 10)
            .map(
              (b: { category: string; text: string }) =>
                `  [${b.category}] ${b.text.slice(0, 80)}`
            )
            .join("\n")
      );
    }

    if (habits.length > 0) {
      const latestWeek = habits[0];
      contextParts.push(
        `Hábitos semana ${latestWeek.week}: intención="${(latestWeek.intention || "").slice(0, 100)}", aprendió="${(latestWeek.learned || "").slice(0, 100)}"`
      );
    }

    if (reflections.length > 0) {
      contextParts.push(
        `Reflexiones de fase:\n` +
          reflections
            .map(
              (r: { phase_id: number; reflection: string }) =>
                `  Fase ${r.phase_id}: ${(r.reflection || "").slice(0, 120)}`
            )
            .join("\n")
      );
    }

    const summaryPrompt = `Eres un asistente de mentoría MAAT. Genera un resumen ejecutivo conciso para el mentor sobre este cliente. Incluye: estado actual, patrones observados, áreas de atención, y recomendaciones para la próxima sesión. Máximo 250 palabras. Responde en español.\n\nDatos del cliente:\n${contextParts.join("\n")}`;

    // Call Mistral API (OpenAI-compatible format)
    const mistralResp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        max_tokens: 800,
        messages: [{ role: "user", content: summaryPrompt }],
      }),
    });

    if (!mistralResp.ok) {
      console.error("Mistral error:", await mistralResp.text());
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mistralData = await mistralResp.json();
    const summary =
      mistralData.choices?.[0]?.message?.content || "No se pudo generar el resumen.";

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("maat-summary error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
