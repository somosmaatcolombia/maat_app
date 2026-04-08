# src/ — Archivos fuente de las apps

## Archivos principales

- `maat_dashboard.html` — App del Cliente (PWA mobile-first)
- `maat_mentor_dashboard.html` — Portal del Mentor (desktop-first)
- `sw.js` — Service Worker para push notifications (pendiente)

## Regla fundamental

Cada archivo HTML es AUTOCONTENIDO — CSS y JS inline, sin dependencias externas excepto:
- Supabase JS v2 via CDN
- Google Fonts (Saira Condensed + Sora)
