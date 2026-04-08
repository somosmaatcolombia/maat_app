-- =====================================================
-- AJUSTE REQUERIDO EN EL PROYECTO CRM
-- =====================================================
--
-- CONTEXTO:
-- La funcion handle_new_user() fue actualizada para que el
-- default de role sea 'client' en lugar de 'advisor'.
-- Esto es necesario porque MAAT y CRM comparten la misma
-- instancia de Supabase y la misma tabla profiles.
--
-- ANTES:  COALESCE(raw_user_meta_data->>'role', 'advisor')
-- AHORA:  COALESCE(raw_user_meta_data->>'role', 'client')
--
-- QUE HACER EN EL CRM:
-- Asegurar que todo signup del CRM envie role:'advisor'
-- en el metadata. Ejemplo:
--
--   const { data, error } = await supabase.auth.signUp({
--     email: email,
--     password: password,
--     options: {
--       data: {
--         full_name: nombre,
--         role: 'advisor'    // <-- AGREGAR ESTO
--       }
--     }
--   });
--
-- Si el CRM ya envia role en metadata, no necesita cambio.
-- Si NO lo envia, los nuevos usuarios del CRM recibiran
-- role='client' en lugar de 'advisor'.
--
-- BUSCAR EN EL CODIGO CRM:
-- Buscar todas las llamadas a auth.signUp() y agregar
-- role: 'advisor' en options.data si no esta presente.
-- =====================================================

-- VERIFICACION: confirmar que handle_new_user ya fue actualizada
SELECT
  CASE
    WHEN routine_definition LIKE '%''client''%'
    THEN 'OK — handle_new_user defaults to client'
    ELSE 'PENDIENTE — ejecutar maat_fixes_urgentes.sql primero'
  END AS estado
FROM information_schema.routines
WHERE routine_name = 'handle_new_user' AND routine_schema = 'public';
