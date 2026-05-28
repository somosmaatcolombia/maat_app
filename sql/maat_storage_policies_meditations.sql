-- =====================================================
-- MAAT - Storage Policies para bucket maat-meditations
-- Ejecutar en Supabase Dashboard > SQL Editor
-- =====================================================
--
-- Configura quien puede LEER, SUBIR, ACTUALIZAR y BORRAR
-- archivos del bucket donde estan los audios e imagenes
-- de las meditaciones guiadas.
--
-- Reglas:
--   LECTURA  : cualquier persona (incluso no autenticada) - bucket publico
--   ESCRITURA: solo mentores y admins
--
-- Prerequisitos:
--   - bucket maat-meditations ya creado (Storage > New bucket > Public)
--   - funcion is_mentor_or_admin(uuid) ya existe en la BD
-- =====================================================

-- Eliminar policies previas si existen (idempotente)
DROP POLICY IF EXISTS "maat_med_public_read"     ON storage.objects;
DROP POLICY IF EXISTS "maat_med_mentor_insert"   ON storage.objects;
DROP POLICY IF EXISTS "maat_med_mentor_update"   ON storage.objects;
DROP POLICY IF EXISTS "maat_med_mentor_delete"   ON storage.objects;

-- 1) LECTURA publica - todos pueden escuchar las meditaciones
CREATE POLICY "maat_med_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'maat-meditations');

-- 2) SUBIR archivos - solo mentores/admins
CREATE POLICY "maat_med_mentor_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'maat-meditations'
  AND is_mentor_or_admin(auth.uid())
);

-- 3) ACTUALIZAR archivos - solo mentores/admins
CREATE POLICY "maat_med_mentor_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'maat-meditations'
  AND is_mentor_or_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'maat-meditations'
  AND is_mentor_or_admin(auth.uid())
);

-- 4) BORRAR archivos - solo mentores/admins
CREATE POLICY "maat_med_mentor_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'maat-meditations'
  AND is_mentor_or_admin(auth.uid())
);

-- =====================================================
-- VERIFICACION
-- Deberian aparecer 4 filas con las policies recien creadas
-- =====================================================
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'maat_med_%'
ORDER BY policyname;
