-- =====================================================
-- MAAT - Comuni-Maat v1.1: enlaces compartidos con miniatura
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente. Requiere sql/maat_comunimaat.sql previo.
--
-- El post puede llevar un enlace (articulo/video). La vista previa (titulo,
-- imagen, dominio) se resuelve UNA vez al publicar (edge fn link-preview)
-- y queda congelada en estas columnas.

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS link_url    TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS link_title  TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS link_image  TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS link_domain TEXT;

-- VERIFICACION
SELECT column_name FROM information_schema.columns
WHERE table_name='community_posts' AND column_name LIKE 'link_%'
ORDER BY column_name;
