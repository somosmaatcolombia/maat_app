# sql/ — Scripts de base de datos

## maat_setup_master.sql (PENDIENTE DE CREAR)

Este archivo debe contener:
1. CREATE TABLE IF NOT EXISTS para las 11 tablas
2. CREATE OR REPLACE FUNCTION get_my_role()
3. DROP/CREATE de todas las políticas RLS
4. INSERT inicial en ai_config
5. SELECT de verificación

Debe ser idempotente (seguro re-ejecutar).
