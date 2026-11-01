-- =====================================================
-- MAAT - Testimonios autogestionados
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Proyecto MAAT: pcclptmojjzqmfmzftot  (NO el CRM)
-- Idempotente: se puede re-ejecutar sin romper nada.
-- =====================================================
-- Quien hizo el proceso deja su testimonio desde la web (somosmaat.org/es/testimonios/):
-- foto pequena, profesion u oficio, de que parte del mundo es y su experiencia.
-- Nadie escribe en esta tabla directamente: la Edge Function `testimonial` valida,
-- sube la foto y guarda. Mentor/admin revisan y aprueban en el panel de feedback.
--
-- Conexion con el modulo de feedback (sql/maat_client_feedback.sql):
--   * El correo se cruza con profiles.email -> matched_user_id. Si coincide con un cliente,
--     el panel muestra su satisfaccion y NPS (client_feedback, momento "final") junto al
--     testimonio, para comprobar que lo que dice en publico coincide con lo que respondio.
--   * El correo NUNCA se publica. Lo unico publico es lo que devuelve get_public_testimonials().
--
-- Requiere: sql/maat_setup_master.sql (profiles, get_my_role, is_mentor_or_admin) y sql/maat_client_feedback.sql.
--
-- Autogestion: cada envio genera un enlace privado (token). Solo se guarda su hash.
--   Con el enlace la persona edita (vuelve a revision) o retira su testimonio.
-- =====================================================

-- -----------------------------------------------------
-- 1) TABLA testimonials
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.testimonials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','withdrawn')),
  lang              text NOT NULL DEFAULT 'es' CHECK (lang IN ('es','en')),
  -- Lo que la persona escribe
  name              text NOT NULL CHECK (char_length(name)     BETWEEN 2 AND 80),
  email             text NOT NULL CHECK (char_length(email)    BETWEEN 5 AND 200),  -- privado
  role              text NOT NULL CHECK (char_length(role)     BETWEEN 2 AND 100),  -- profesion u oficio
  location          text NOT NULL CHECK (char_length(location) BETWEEN 2 AND 100),  -- ciudad, pais
  quote             text NOT NULL CHECK (char_length(quote)    BETWEEN 60 AND 1500), -- su experiencia
  photo_path        text,                                  -- ruta en el bucket testimonial-photos
  consent           boolean NOT NULL CHECK (consent),      -- autoriza publicar nombre, foto y texto
  consent_at        timestamptz NOT NULL DEFAULT now(),
  -- Lo que decide MAAT al revisar
  niche             text CHECK (niche IN ('pros','artists','founders','orgs')),
  featured          boolean NOT NULL DEFAULT false,        -- candidato al carrusel de la portada
  admin_note        text,                                  -- nota interna (nunca se publica)
  reviewed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  published_at      timestamptz,
  withdrawn_at      timestamptz,
  -- Trazabilidad
  matched_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- cliente con ese correo (si existe)
  manage_token_hash text NOT NULL UNIQUE,                  -- sha256 del enlace privado de gestion
  ip_hash           text                                   -- sha256(ip + sal): solo para limitar abuso
);

CREATE INDEX IF NOT EXISTS idx_testimonials_status  ON public.testimonials (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_testimonials_user    ON public.testimonials (matched_user_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_iphash  ON public.testimonials (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_testimonials_email   ON public.testimonials (lower(email));

-- -----------------------------------------------------
-- 2) Triggers: updated_at, sello de revision y de publicacion
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_testimonial()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  -- Cuando mentor/admin cambian el estado, queda quien y cuando
  IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL THEN
    NEW.reviewed_by = auth.uid();
    NEW.reviewed_at = now();
  END IF;
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.published_at = now();
  END IF;
  IF NEW.status <> 'approved' THEN
    NEW.featured = false;       -- lo que no esta publicado no puede estar destacado
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_testimonial ON public.testimonials;
CREATE TRIGGER trg_touch_testimonial
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.touch_testimonial();

-- -----------------------------------------------------
-- 3) RLS (Regla 3: nunca consultar la misma tabla; usar get_my_role())
--    Solo mentor/admin leen y revisan. Insert: nadie directo (lo hace la Edge Function
--    con service_role, que se salta el RLS). El publico solo ve get_public_testimonials().
-- -----------------------------------------------------
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS testimonials_staff_select ON public.testimonials;
CREATE POLICY testimonials_staff_select ON public.testimonials
  FOR SELECT TO authenticated USING (get_my_role() IN ('mentor', 'admin'));

DROP POLICY IF EXISTS testimonials_staff_update ON public.testimonials;
CREATE POLICY testimonials_staff_update ON public.testimonials
  FOR UPDATE TO authenticated
  USING      (get_my_role() IN ('mentor', 'admin'))
  WITH CHECK (get_my_role() IN ('mentor', 'admin'));

DROP POLICY IF EXISTS testimonials_staff_delete ON public.testimonials;
CREATE POLICY testimonials_staff_delete ON public.testimonials
  FOR DELETE TO authenticated USING (get_my_role() IN ('mentor', 'admin'));

-- Privilegios a nivel de columna: el staff puede revisar, pero NO reescribir lo que dijo la persona
REVOKE ALL ON public.testimonials FROM anon, authenticated;
GRANT SELECT, DELETE ON public.testimonials TO authenticated;
GRANT UPDATE (status, niche, featured, admin_note) ON public.testimonials TO authenticated;

-- -----------------------------------------------------
-- 4) Lectura publica: SOLO lo aprobado y SOLO columnas seguras (sin correo, sin notas)
--    Funcion SECURITY DEFINER en vez de vista: evita el aviso "security definer view".
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_testimonials(p_lang text DEFAULT NULL)
RETURNS TABLE (
  id uuid, name text, role text, location text, quote text, photo_path text,
  lang text, niche text, featured boolean, published_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.id, t.name, t.role, t.location, t.quote, t.photo_path,
         t.lang, t.niche, t.featured, t.published_at
  FROM public.testimonials t
  WHERE t.status = 'approved'
    AND (p_lang IS NULL OR t.lang = p_lang)
  ORDER BY t.featured DESC, t.published_at DESC
  LIMIT 60;
$$;

REVOKE ALL ON FUNCTION public.get_public_testimonials(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_testimonials(text) TO anon, authenticated;

-- -----------------------------------------------------
-- 5) Bucket de fotos (lectura publica; escritura SOLO por la Edge Function)
--    La foto ya llega recortada y reducida desde el navegador (max ~400 KB).
-- -----------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('testimonial-photos', 'testimonial-photos', true, 524288,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 524288,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Mentor/admin pueden borrar fotos (al eliminar un testimonio desde el panel). Mismo patron que
-- sql/maat_storage_policies_meditations.sql. La escritura la hace SOLO la Edge Function (service_role).
DROP POLICY IF EXISTS "testimonial photos staff delete" ON storage.objects;
CREATE POLICY "testimonial photos staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'testimonial-photos' AND is_mentor_or_admin(auth.uid()));

-- -----------------------------------------------------
-- 6) Verificacion
-- -----------------------------------------------------
-- SELECT * FROM public.testimonials ORDER BY created_at DESC LIMIT 5;           -- como mentor/admin
-- SELECT * FROM public.get_public_testimonials('es');                           -- publico: solo aprobados
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'testimonial-photos';
--
-- Prueba de privacidad (debe devolver 0 filas y error de permiso, desde un cliente anon):
--   GET {SUPABASE_URL}/rest/v1/testimonials?select=email   ->  permission denied / []
