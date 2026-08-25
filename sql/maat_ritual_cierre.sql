-- =====================================================
-- MAAT - Ritual de cierre (noche) + ritual de manana
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente. NO borra ni modifica datos existentes.
-- =====================================================
-- Cambia el eje del ritual diario:
--   NOCHE  -> cierras el dia (que hiciste, que falto, que agradeces,
--             termometro de coherencia, aprendizaje) y eliges LO MAS
--             IMPORTANTE DE MANANA.
--   MANANA -> lees tu statement, escuchas tu autohipnosis y ves la
--             prioridad que elegiste anoche.
--
-- Se mantiene UNA fila por dia (UNIQUE user_id,date): la noche llena la
-- reflexion, la manana marca morning_done_at. La prioridad de manana se
-- guarda en la fila de HOY y manana se lee desde la fila de AYER.
--
-- Las columnas viejas (answer_q1/q2/q3) NO se tocan: conservan el historico
-- del ritual matutino anterior (q1=gratitud, q2=creencia, q3=evitacion).
-- =====================================================

-- -----------------------------------------------------
-- 1. Reflexion de la noche
-- -----------------------------------------------------
ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS did_text        TEXT; -- que hice hoy
ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS missing_text    TEXT; -- que hizo falta
ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS gratitude_text  TEXT; -- que agradezco mas de hoy
ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS learning_text   TEXT; -- que aprendi

-- -----------------------------------------------------
-- 2. El circulo: prioridad de manana + si se cumplio la de ayer
-- -----------------------------------------------------
ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS tomorrow_priority TEXT;
ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS priority_done     TEXT;

-- priority_done: 'si' | 'parcial' | 'no' (o NULL si no habia prioridad previa)
ALTER TABLE calibrations DROP CONSTRAINT IF EXISTS calib_priority_done_chk;
ALTER TABLE calibrations ADD CONSTRAINT calib_priority_done_chk
  CHECK (priority_done IS NULL OR priority_done IN ('si','parcial','no'));

-- -----------------------------------------------------
-- 3. Ritual de manana (statement + autohipnosis) ya hecho hoy
-- -----------------------------------------------------
ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS morning_done_at TIMESTAMPTZ;

-- -----------------------------------------------------
-- 4. Indice para leer rapido la prioridad de ayer
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_calibrations_user_date ON calibrations(user_id, date DESC);

-- -----------------------------------------------------
-- 5. Verificacion
-- -----------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'calibrations'
  AND column_name IN ('did_text','missing_text','gratitude_text','learning_text',
                      'tomorrow_priority','priority_done','morning_done_at')
ORDER BY column_name;
