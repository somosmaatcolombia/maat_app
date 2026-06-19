-- =====================================================
-- MAAT - Suspension de acceso por pago (admin)
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente.
--
-- Reusa profiles.active como compuerta de acceso (la app del cliente ya bloquea
-- el login si active=false). Agrega contexto de pago + auditoria de la suspension,
-- y CIERRA el hueco de que un cliente se auto-reactive editando su propia fila.

-- 1. Columnas de pago / auditoria de suspension
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paid_through      DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_by      UUID;

-- 2. Proteccion a nivel columna (RLS es por fila, no por columna).
--    La policy profiles_update permite a un cliente editar su PROPIA fila, lo que
--    sin esto le permitiria poner active=true y saltarse la suspension. Este trigger
--    impide que un NO-staff (cliente) cambie las columnas de acceso/pago.
CREATE OR REPLACE FUNCTION protect_profile_billing_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF get_my_role() NOT IN ('mentor', 'admin') THEN
    IF NEW.active           IS DISTINCT FROM OLD.active
       OR NEW.paid_through     IS DISTINCT FROM OLD.paid_through
       OR NEW.suspended_at     IS DISTINCT FROM OLD.suspended_at
       OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
       OR NEW.suspended_by     IS DISTINCT FROM OLD.suspended_by THEN
      RAISE EXCEPTION 'Solo un mentor o administrador puede cambiar el estado de acceso o pago';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_billing ON profiles;
CREATE TRIGGER trg_protect_profile_billing
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_billing_columns();

-- 3. Indice para listar vencidos rapido (opcional, ayuda con muchos clientes)
CREATE INDEX IF NOT EXISTS idx_profiles_paid_through
  ON profiles(paid_through) WHERE paid_through IS NOT NULL;

-- =====================================================
-- VERIFICACION
-- =====================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('paid_through','suspended_at','suspended_reason','suspended_by')
ORDER BY column_name;

SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_profile_billing';
