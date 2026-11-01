# Testimonios autogestionados

Quien hizo el proceso deja su propio testimonio desde la web (foto pequeña, profesión u oficio, de qué parte del
mundo es y su experiencia). Nada se publica hasta que mentor/admin lo aprueban. Está conectado al módulo de
feedback para comprobar la satisfacción de quien lo escribe.

## Cómo funciona

```
Cliente cierra el proceso (/feedback/, momento final)
   └─ autoriza su frase como testimonio ──► botón "Contar mi experiencia"  (nombre, correo y frase viajan por localStorage)
                                              │
Cualquier persona que hizo el proceso ──────► somosmaat.org/es/testimonios/#comparte   (EN: /en/testimonials/#share)
                                              │  el navegador recorta la foto en cuadrado y la reduce (~25-400 KB)
                                              ▼
                              Edge Function `testimonial`  (valida TODO en el servidor)
                                              │  guarda como PENDIENTE + sube la foto + avisa por correo
                                              ▼
                        tabla `testimonials`  ◄── cruza el correo con profiles.email → matched_user_id
                                              │
                  Panel /feedback-panel/  ► "Testimonios en la web": foto, texto, categoría,
                                              satisfacción y NPS del cliente, alerta si son bajos
                                              │  Aprobar y publicar
                                              ▼
                  RPC `get_public_testimonials`  ► la página de testimonios los agrega a la cuadrícula
```

**Autogestión:** cada envío devuelve un enlace privado (`?edit=TOKEN`, también por correo). Con él la persona edita
(el testimonio vuelve a revisión) o lo retira (deja de mostrarse al instante y se borra su foto). Solo se guarda el
hash del token. No hace falta cuenta, así que funciona también para quienes hicieron el proceso antes de la app.

**Satisfacción:** si el correo coincide con un cliente, el panel muestra su satisfacción (cierre; si no, intermedio)
y su NPS. Si alguno es ≤ 6 aparece una alerta y pide confirmación antes de publicar. Los testimonios sin cuenta
quedan marcados "verifícalo tú". Las respuestas de feedback siguen siendo privadas.

## Archivos

| Pieza | Archivo |
|-------|---------|
| Tabla, permisos, RPC pública, bucket de fotos | `sql/maat_testimonials.sql` |
| Edge Function (lógica pura y probada) | `supabase/functions/testimonial/` → `lib.ts`, `core.ts`, `mail.ts`, `index.ts` |
| Pruebas (27) | `node --test supabase/functions/testimonial/lib.test.ts supabase/functions/testimonial/core.test.ts` |
| Panel de revisión | `src/maat_feedback_dashboard.html` (tarjeta "Testimonios en la web") |
| Invitación al cerrar el feedback | `src/maat_feedback.html` (`setupTestimonialInvite`) |
| Formulario + tarjetas en la web | repo del sitio (`~/Projects/Maat-website2026`): `build.py` (`block_testimonial_form`, `TF`), `src/assets/js/maat.js`, `maat.css` |

## Despliegue (en este orden; nada de esto se hace solo)

1. **SQL** — Supabase Dashboard → SQL Editor → pegar y correr `sql/maat_testimonials.sql` (idempotente).
2. **Edge Function**
   ```bash
   cd Maat_app
   supabase link --project-ref pcclptmojjzqmfmzftot      # el hook bloquea cualquier otro proyecto
   supabase functions deploy testimonial --no-verify-jwt
   ```
   Secrets opcionales (`supabase secrets set ...`): `TESTIMONIAL_NOTIFY_EMAIL` (buzón que recibe el aviso de
   "nuevo testimonio"), `TESTIMONIAL_SALT` (sal propia para el hash de IP), `TESTIMONIAL_ORIGINS` (dominios
   permitidos en el enlace de gestión; por defecto somosmaat.org y v2.somosmaat.org). Los correos usan los mismos
   `SMTP_*` de `send-biotipo-result`; **sin SMTP el testimonio se guarda igual, solo no hay correos**.
3. **App**: `git push` a `main` (tocan `src/`) → el Action despliega `/feedback/` y `/feedback-panel/`. Purgar
   LiteSpeed una vez si no se ve el cambio (ver `project_feedback_traceability` en memoria).
4. **Web**: regenerar el zip y subirlo (hoy primero a `v2.somosmaat.org`, ver el README del sitio).

## Comprobaciones después de desplegar

```bash
# la función responde y no se deja engañar
curl -s -X POST https://pcclptmojjzqmfmzftot.supabase.co/functions/v1/testimonial \
  -H 'content-type: application/json' -d '{"op":"get","token":"x"}'          # -> {"error":"not_found"}

# el correo NO se puede leer sin ser mentor/admin (debe fallar con permission denied)
curl -s "https://pcclptmojjzqmfmzftot.supabase.co/rest/v1/testimonials?select=email" \
  -H "apikey: <ANON_KEY>"

# lo público solo devuelve aprobados y sin correo
curl -s -X POST https://pcclptmojjzqmfmzftot.supabase.co/rest/v1/rpc/get_public_testimonials \
  -H "apikey: <ANON_KEY>" -H 'content-type: application/json' -d '{}'
```
Y a mano: enviar un testimonio de prueba con foto → aparece "Por revisar" en el panel → aprobar → se ve en la web →
abrir el enlace privado → editar (sale de la web) → retirar (se borra la foto).

## Controles de abuso y privacidad

- El formulario no escribe en la base: solo la Edge Function (service_role). `anon` no tiene permisos sobre la tabla.
- Servidor: tipo real de imagen por sus bytes (JPEG/PNG/WebP, ≤ 400 KB; se rechaza SVG/HTML/GIF), máximo un
  enlace en el texto y ninguno en los campos cortos, campo trampa para bots, tiempo mínimo de llenado,
  3 envíos por IP cada 24 h (se guarda solo un hash con sal).
- Fotos con caché corta (5 min) a propósito: al retirar o eliminar, el archivo se borra del almacenamiento al instante y
  la URL deja de servirse desde el CDN en minutos (con caché de 1 año seguía sirviéndose; lo descubrió la prueba en producción).
- El correo nunca sale en la API pública ni en la web. El token del enlace no queda en la URL (se quita al cargar, así
  Analytics no lo registra).
- Política de privacidad actualizada (ES/EN) con los datos que se guardan y cómo retirarlos. Pedido de borrado total:
  eliminar la fila desde el panel (borra también la foto).

## Ideas pendientes

- Carrusel de la portada con los testimonios marcados "Destacar" (`featured`, ya se guarda).
- Turnstile/hCaptcha si algún día hay spam real.
- Testimonios aprobados en el JSON-LD (Review) de `tools/seo.py`.
