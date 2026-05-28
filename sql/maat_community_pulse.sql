-- =====================================================
-- MAAT - Pulso de Comunidad (capa social ligera)
-- Ejecutar en Supabase Dashboard > SQL Editor
-- =====================================================
-- Devuelve SOLO conteos agregados (nunca datos individuales).
-- SECURITY DEFINER para poder contar sobre toda la tabla sin
-- violar RLS ni exponer informacion de otros usuarios.
-- =====================================================

CREATE OR REPLACE FUNCTION get_community_pulse()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    -- usuarios distintos que calibraron HOY
    'today', (
      SELECT COUNT(DISTINCT user_id)
      FROM calibrations
      WHERE created_at >= date_trunc('day', now())
    ),
    -- usuarios distintos que calibraron en los ultimos 7 dias
    'week', (
      SELECT COUNT(DISTINCT user_id)
      FROM calibrations
      WHERE created_at >= now() - interval '7 days'
    ),
    -- total de miembros activos de la comunidad
    'members', (
      SELECT COUNT(*)
      FROM profiles
      WHERE role = 'client' AND active IS NOT FALSE
    )
  );
$$;

-- Cualquier usuario autenticado puede consultar el pulso (solo conteos)
GRANT EXECUTE ON FUNCTION get_community_pulse() TO authenticated;

-- Verificacion
SELECT get_community_pulse();
