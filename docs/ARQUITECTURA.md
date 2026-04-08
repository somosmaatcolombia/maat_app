# MAAT — Documento Madre de Arquitectura

> Especificación completa para reconstrucción limpia desde cero
> Versión: 1.0 — Febrero 2026 | Proyecto: somosmaat.org | Supabase: pcclptmojjzqmfmzftot

Para el contenido completo, ver `ARQUITECTURA_ORIGINAL.docx` en esta carpeta.
El contexto operativo está en `../CLAUDE.md`.

## Índice del documento original

1. **Visión General** — Proceso MAAT, stack técnico, 6 reglas arquitectónicas
2. **Sistema de Diseño** — Paleta, tipografía, componentes
3. **Base de Datos** — 11 tablas, Storage, get_my_role(), políticas RLS
4. **App del Cliente** — Auth, loadData(), vistas, calibración, hábitos, coach IA, push, perfil
5. **Portal del Mentor** — Layout, acceso, vistas, loadData(), createClient(), alertas, resumen IA
6. **Edge Functions** — coach-maat, send-notifications
7. **Patrones de Código** — Queries, carga paralela, botones, sesión, XSS, data-attributes
8. **Internacionalización** — i18n ES/EN completo
9. **Prompts para Claude** — SQL maestro, app cliente, portal mentor
