# MAAT - Gestion de acceso y claves (creacion de usuarios optimizada)

> Cierra los huecos de la auditoria del modulo de creacion de usuarios: cliente sin
> "olvide mi contrasena", mentor sin forma de reenviar acceso, doble email confuso del
> registro, enlaces vencidos sin mensaje, y REDIRECT_URL apuntando a un 404.

## Hallazgos que se corrigieron

| # | Problema | Fix |
|---|----------|-----|
| 1 | Cliente que olvida su clave = cuenta muerta (sin autoservicio) | Link "Olvidaste tu contrasena?" en el login -> email de recovery -> overlay de nueva clave |
| 2 | Mentor veia la clave UNA vez y no podia reenviar acceso | Flujo por ENLACE: al crear cliente se le envia email de activacion; boton "Enviar acceso" en el perfil para reenviar cuando sea |
| 3 | Registro por landing enviaba 2 emails y el de confirmacion (type=signup) no pedia crear clave -> usuario bloqueado despues | `isRecoveryUrl()` ahora acepta signup/invite/magiclink: cualquier enlace de email lleva a crear contrasena |
| 4 | Enlace vencido (otp_expired) mostraba el login sin explicacion | Mensaje claro + instruccion de pedir uno nuevo |
| 5 | createClient: upsert sin email (fragil) y error crudo si el correo ya existia | Email en el upsert; correo existente = re-vincula al mentor y envia enlace de acceso |
| 6 | Sin "cambiar contrasena" dentro de la app | Item "CAMBIAR CLAVE" en Mas -> overlay con modo cambio (incluye Cancelar) |
| 7 | REDIRECT_URL de la landing apuntaba a www.somosmaat.org/app/ (404) | Cambiado a somosmaat.org/app/ (sin www) |

## Flujos resultantes

**Creacion por mentor:** Crear Cliente (nombre+email) -> el cliente recibe email ->
abre el enlace -> cae en /app/ con el overlay "crea tu contrasena" -> listo. El mentor
nunca maneja claves. Si el correo ya tenia cuenta: se re-vincula y se le envia enlace
de recuperacion.

**Auto-registro (landing):** igual que antes, pero ahora CUALQUIERA de los 2 emails
(confirmacion o activacion) termina en el overlay de crear contrasena.

**Clave olvidada:** login -> "Olvidaste tu contrasena?" (con su email escrito) ->
email -> overlay de nueva clave. Tambien el mentor puede dispararlo con "Enviar acceso".

**Cambio voluntario:** Mas -> CAMBIAR CLAVE (con sesion activa, sin email de por medio).

## Notas tecnicas

- `resetPasswordForEmail` redirige a `location.origin+pathname` en la app (funciona en
  /app/ y en previews) y a `CONFIG.APP_URL` desde el portal. Ambos deben estar en
  Authentication -> URL Configuration -> Redirect URLs (ya estan: somosmaat.org/app/).
- Rate limit de Supabase: los emails de recovery tienen limite por hora; si el mentor
  reenvia muchas veces seguidas puede recibir "over_email_send_rate_limit" (esperar).
- El overlay de crear clave requiere sesion (el enlace la crea); si el enlace expiro,
  el hash trae `otp_expired` y la app lo explica.

## Activacion

Solo frontend: `./build_deploy.sh` y subir los 3 archivos:
- `deploy/app/index.html` (login con olvido + overlay + cambiar clave)
- `deploy/mentor/index.html` (creacion por enlace + Enviar acceso)
- `deploy/onboarding/index.html` (REDIRECT_URL sin www)

## QA
1. Login de la app -> escribir email -> "Olvidaste tu contrasena?" -> llega email ->
   crear clave nueva -> entrar.
2. Portal -> Crear Cliente con un correo nuevo -> el cliente recibe enlace -> crea su
   clave -> entra. Repetir con el MISMO correo: debe decir "ya tenia cuenta" y reenviar.
3. Perfil del cliente -> "Enviar acceso" -> llega email de recuperacion.
4. Abrir un enlace viejo/ya usado -> el login muestra el mensaje de enlace vencido.
5. Mas -> CAMBIAR CLAVE -> cambiar y volver a entrar con la nueva.
