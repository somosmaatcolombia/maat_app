# Panel de control (somosmaat.org/panel/)

Un solo lugar, con tu usuario de MAAT, para entrar a la app, el feedback, los testimonios por revisar, el CRM y la app
de redes. Muestra cuatro cifras en vivo (clientes activos, cierres completados, testimonios por revisar, referidos pendientes).

- **Archivo:** `src/maat_panel.html` (una sola pagina, bilingue ES/EN, ASCII puro). Se publica con `build_deploy.sh` en `/panel/`.
- **Quien entra:** `profiles.role` = `mentor` o `admin` (Regla 4). Un cliente es expulsado con mensaje y se cierra su sesion.
  El mentor no ve el CRM, las redes ni la version v2 (solo `admin`).
- **Sesion:** misma sesion de Supabase que `/app/`, `/mentor/` y `/feedback-panel/` (mismo origen). El CRM y Content OS son OTROS
  proyectos Supabase con cuentas propias: el panel solo te lleva a ellos, cada uno pide su acceso.
- **No es una barrera de seguridad:** las direcciones de las herramientas van en el codigo de la pagina (cualquiera puede leerlas). La
  proteccion real es el login de cada herramienta. Por eso NO se incluyen enlaces a cPanel, Supabase, GitHub ni Vercel.
- **No se indexa:** `<meta robots noindex>` + `Disallow: /panel/` en `robots.txt` del sitio.

## Agregar o cambiar una herramienta
En `src/maat_panel.html`, arreglo `TOOLS`: una linea por herramienta (`id`, `group`, `roles`, `rune`, `col`, `href`, `es`/`en`).
Los simbolos (`rune`) son los de `https://somosmaat.org/assets/img/runas/` (los sube el zip de la web: hasta entonces la tarjeta sale sin simbolo).

## Subdominios (opcional): app., feedback., panel., crm., redes.
Hoy las tarjetas usan las direcciones reales:

| Herramienta | Direccion de hoy | Subdominio sugerido |
|---|---|---|
| App del cliente | somosmaat.org/app/ | `app.somosmaat.org` |
| Dashboard de feedback | somosmaat.org/feedback-panel/ | `feedback.somosmaat.org` |
| Panel de control | somosmaat.org/panel/ | `panel.somosmaat.org` |
| CRM | maatcrm.vercel.app | `crm.somosmaat.org` |
| Redes (Content OS) | content-os.vercel.app | `redes.somosmaat.org` |

El DNS lo administra Banahosting (cPanel). **Lo crea la persona, no el asistente** (cambios de dominio/DNS).

**A) app., feedback., panel. (viven en tu hosting): redireccion**
1. cPanel > Domains > Create A New Domain: `app.somosmaat.org`. **Desmarcar** "Share document root" (viene marcada). Document Root: `app.somosmaat.org`.
   (Tip del navegador integrado: si la casilla no responde al clic, enfocarla y usar la barra espaciadora.)
2. En esa carpeta, crear `.htaccess` con el contenido de `docs/subdominios/app.htaccess` (redirige todo a somosmaat.org/app/).
3. Repetir con `feedback` y `panel`.
Nota: es una REDIRECCION, no un duplicado: la PWA sigue viviendo en `/app/` (su scope y su service worker no cambian).

**B) crm., redes. (viven en Vercel): dominio propio**
1. Vercel > proyecto `maat_crm` (o `content-os`) > Settings > Domains > Add `crm.somosmaat.org` (o `redes.`). Vercel muestra el registro a crear.
2. cPanel > Zone Editor > Add Record: tipo CNAME, nombre `crm`, destino el que indique Vercel (normalmente `cname.vercel-dns.com`).
3. Esperar la verificacion y el certificado (minutos).
4. Supabase de ese proyecto > Authentication > URL Configuration: agregar `https://crm.somosmaat.org` a Site URL / Redirect URLs
   (CRM: proyecto `vbfesmgxegxsurnfazjs`; Content OS: proyecto aparte). Sin esto fallan los enlaces de correo y el OAuth; el login con clave sigue funcionando.

**C) Avisar al panel:** en `src/maat_panel.html`, constante `SUBDOMINIOS_ACTIVOS`, por ejemplo
`{app:"https://app.somosmaat.org/", crm:"https://crm.somosmaat.org/"}`; push a `main` y esa tarjeta usa el subdominio.
