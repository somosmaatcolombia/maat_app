-- =====================================================
-- MAAT - Comuni-Maat (red privada) + avatares de perfil
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente.
--
-- 1. community_posts / community_reactions: publicaciones (lecciones, logros,
--    aprendizajes, experiencias) de clientes activos y graduados. Publicacion
--    directa; el mentor puede ocultar (is_hidden) desde el portal.
-- 2. Bucket maat-avatars: fotos de perfil (cada usuario sube solo a su carpeta).
--
-- La BD es compartida con el CRM: TODAS las politicas exigen rol MAAT
-- (client/mentor/admin) via get_my_role() — los 'advisor' del CRM quedan fuera.

-- =====================================================
-- 1. TABLAS
-- =====================================================
CREATE TABLE IF NOT EXISTS community_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'experiencia'
              CHECK (category IN ('leccion','logro','aprendizaje','experiencia')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  week        INTEGER,                 -- semana del proceso al publicar (contexto)
  is_hidden   BOOLEAN NOT NULL DEFAULT false,  -- moderacion del mentor
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cposts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cposts_user    ON community_posts(user_id);

CREATE TABLE IF NOT EXISTS community_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'corazon'
              CHECK (kind IN ('corazon','aplauso','inspira')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)             -- una reaccion por persona por post
);

CREATE INDEX IF NOT EXISTS idx_creact_post ON community_reactions(post_id);

-- =====================================================
-- 2. RLS
-- =====================================================
ALTER TABLE community_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;

-- ---------- community_posts ----------
DROP POLICY IF EXISTS cposts_select ON community_posts;
CREATE POLICY cposts_select ON community_posts
  FOR SELECT USING (
    get_my_role() IN ('client','mentor','admin')
    AND (is_hidden = false OR auth.uid() = user_id OR get_my_role() IN ('mentor','admin'))
  );

DROP POLICY IF EXISTS cposts_insert ON community_posts;
CREATE POLICY cposts_insert ON community_posts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND get_my_role() IN ('client','mentor','admin')
  );

DROP POLICY IF EXISTS cposts_update ON community_posts;
CREATE POLICY cposts_update ON community_posts
  FOR UPDATE USING (auth.uid() = user_id OR get_my_role() IN ('mentor','admin'))
  WITH CHECK (auth.uid() = user_id OR get_my_role() IN ('mentor','admin'));

DROP POLICY IF EXISTS cposts_delete ON community_posts;
CREATE POLICY cposts_delete ON community_posts
  FOR DELETE USING (auth.uid() = user_id OR get_my_role() IN ('mentor','admin'));

-- ---------- community_reactions ----------
DROP POLICY IF EXISTS creact_select ON community_reactions;
CREATE POLICY creact_select ON community_reactions
  FOR SELECT USING (get_my_role() IN ('client','mentor','admin'));

DROP POLICY IF EXISTS creact_insert ON community_reactions;
CREATE POLICY creact_insert ON community_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND get_my_role() IN ('client','mentor','admin')
  );

DROP POLICY IF EXISTS creact_delete ON community_reactions;
CREATE POLICY creact_delete ON community_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- 3. BUCKET DE AVATARES (fotos de perfil)
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('maat-avatars','maat-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Lectura publica (la URL del avatar se guarda en profiles.avatar_url)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'maat-avatars');

-- Cada usuario escribe SOLO dentro de su carpeta {uid}/...
DROP POLICY IF EXISTS "avatars_own_insert" ON storage.objects;
CREATE POLICY "avatars_own_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'maat-avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'maat-avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'maat-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'maat-avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================
-- VERIFICACION
-- =====================================================
SELECT 'community_posts' AS t, count(*) FROM community_posts
UNION ALL SELECT 'community_reactions', count(*) FROM community_reactions;

SELECT id, public FROM storage.buckets WHERE id = 'maat-avatars';
