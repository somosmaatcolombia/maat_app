# MAAT - Comuni-Maat (red privada) + Foto de perfil

> Red privada de la mentoria: activos y graduados comparten lecciones, logros,
> aprendizajes y experiencias (estilo Substack interno), con reacciones.
> Ademas: foto de perfil que aparece en el topbar de la app y en el portal.

## Que se construyo

| Pieza | Archivo | Que hace |
|-------|---------|----------|
| Schema | `sql/maat_comunimaat.sql` | `community_posts` (categoria/titulo/texto/semana/is_hidden) + `community_reactions` (1 por persona/post) + RLS solo roles MAAT + bucket `maat-avatars` con politicas por carpeta |
| App cliente | `src/maat_dashboard.html` | Vista **Comuni-Maat** (Mas): feed paginado, composer, editar/borrar propios, 3 reacciones (corazon/aplauso/inspira). **Foto de perfil**: "Cambiar foto" en el sheet del perfil (resize a 256px en el navegador) -> topbar muestra la foto |
| Portal | `src/maat_mentor_dashboard.html` | Pestana **Comuni-Maat**: moderacion (Ocultar/Mostrar/Eliminar). Tarjetas de clientes muestran la foto |

## Reglas de producto (decididas)
- **Publicacion directa** (sin aprobacion previa); el mentor puede **ocultar** desde el
  portal (el autor la sigue viendo marcada "Oculto por el mentor").
- **Solo reacciones** en v1 (sin comentarios).
- Autores muestran insignia: **"Semana N"** (activos) o **"Graduado"**.
- La BD es compartida con el CRM: el RLS exige rol MAAT (client/mentor/admin) para
  leer/escribir — los usuarios del CRM no ven nada.
- Suspendidos no participan (no pueden iniciar sesion).

## Activacion (pasos del usuario)

1. **SQL:** correr `sql/maat_comunimaat.sql` en Supabase (proyecto
   `pcclptmojjzqmfmzftot`). Crea tablas + RLS + bucket. Idempotente.
2. **Apps:** `./build_deploy.sh` y subir `deploy/app/index.html` +
   `deploy/mentor/index.html`.

Sin edge functions ni cron: todo va directo por RLS.

## QA

1. App -> boton de perfil (topbar) -> **CAMBIAR FOTO** -> elegir imagen -> el circulo
   del topbar muestra la foto. En el portal, la tarjeta del cliente tambien.
2. App -> Mas -> **COMUNI-MAAT** -> publicar (categoria+titulo+texto) -> aparece en el
   feed con tu foto y "Semana N".
3. Con otro usuario: ver el post, reaccionar (corazon) -> el conteo sube; cambiar a
   aplauso -> se mueve (1 reaccion por persona).
4. Editar/eliminar solo aparece en publicaciones propias.
5. Portal -> **Comuni-Maat** -> Ocultar un post -> desaparece del feed de otros; el
   autor lo ve marcado. Mostrar lo restaura.
6. Un usuario graduado publica -> insignia "Graduado".

## v2 (no incluido, si la comunidad lo pide)
Comentarios en publicaciones · notificacion push "alguien reacciono a tu post" ·
teaser de ultimas publicaciones en el home.
