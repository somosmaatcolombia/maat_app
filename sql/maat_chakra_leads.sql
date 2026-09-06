-- =====================================================
-- MAAT - Viaje a los 7 Chakras: captura de leads
-- Proyecto Supabase: pcclptmojjzqmfmzftot  (NO el CRM)
-- Idempotente: se puede correr varias veces sin romper nada.
-- Mismo patron que biotype_leads (sql/maat_biotipos.sql).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chakra_leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  email       text NOT NULL,
  whatsapp    text,
  consent     boolean NOT NULL DEFAULT false,
  lang        text DEFAULT 'es',
  source      text DEFAULT 'chakras',
  utm         jsonb,          -- {utm_source, utm_medium, utm_campaign, ...}
  referrer    text,
  crm_status  text,           -- inserted | duplicate | error:... | null (aun sin empujar)
  crm_id      text,           -- id del prospect en el CRM, cuando el push funciona
  meta        jsonb,          -- espacio para fases futuras (escaneo, sesiones, sello)
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chakra_leads ENABLE ROW LEVEL SECURITY;

-- Insert publico (anon): un visitante puede dejar sus datos, nada mas.
DROP POLICY IF EXISTS "chakra_leads insert publico" ON public.chakra_leads;
CREATE POLICY "chakra_leads insert publico"
  ON public.chakra_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Lectura SOLO para mentor/admin (son datos personales).
DROP POLICY IF EXISTS "chakra_leads lee staff" ON public.chakra_leads;
CREATE POLICY "chakra_leads lee staff"
  ON public.chakra_leads FOR SELECT
  TO authenticated
  USING (public.is_mentor_or_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS chakra_leads_created_idx ON public.chakra_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS chakra_leads_email_idx   ON public.chakra_leads (lower(email));

-- Un correo puede volver (otra campana, otro retiro): no hay UNIQUE.
-- La deduplicacion vive en el CRM, no aqui: aqui interesa el historial.
