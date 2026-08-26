# MCP de MAAT — el agente de tu mentoría

Le da a **Claude** acceso a MAAT para que puedas pedirle cosas en lenguaje normal:

> *"¿Quién lleva 3 días sin cerrar su día?"*
> *"Prepárame el brief de la sesión del jueves"*
> *"Manda un push a la cohorte recordando la sesión"*
> *"¿Cómo va el NPS?"*

---

## Seguridad — léelo antes

- **Entra con TU cuenta de mentor**, no con una llave maestra. Las policies RLS siguen
  aplicando: el agente **no puede hacer nada que tú no pudieras hacer** en el portal.
- **`maat_send_push` simula por defecto.** Muestra a cuántos llegaría y con qué texto,
  **sin enviar**. Solo envía si se confirma explícitamente. Un push no se puede deshacer.
- Tu contraseña vive **solo en la config local** de Claude, nunca en este repo.
- El agente puede **leer las reflexiones íntimas de tus clientes** (lo que agradecen, lo que
  evitan). Tenlo presente al compartir pantalla o pegar respuestas en otro lado.

---

## Instalación (una vez)

```bash
cd "Maat App/Maat_app/mcp"
npm install
npm run build
```

## Conectarlo a Claude Code

```bash
claude mcp add maat \
  --env MAAT_EMAIL=tu-correo@ejemplo.com \
  --env MAAT_PASSWORD=tu-contraseña \
  -- node "/Users/rubrojasl/Projects/Maat App/Maat_app/mcp/dist/index.js"
```

## Conectarlo a Claude Desktop

Edita `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "maat": {
      "command": "node",
      "args": ["/Users/rubrojasl/Projects/Maat App/Maat_app/mcp/dist/index.js"],
      "env": {
        "MAAT_EMAIL": "tu-correo@ejemplo.com",
        "MAAT_PASSWORD": "tu-contraseña"
      }
    }
  }
}
```

Reinicia Claude Desktop. Debe aparecer "maat" en las herramientas disponibles.

---

## Las 11 herramientas

### Seguimiento
| Herramienta | Para qué |
|---|---|
| `maat_list_clients` | Panorama: semana, estado, hace cuánto no aparecen |
| `maat_get_client` | Ficha completa de uno: sus cierres, qué agradeció, qué aprendió |
| `maat_find_at_risk` | Quién se está enfriando y por qué |

### Sesiones
| Herramienta | Para qué |
|---|---|
| `maat_list_sessions` | Agenda (próximas o pasadas) |
| `maat_schedule_session` | Agendar 1:1 o grupal, con recordatorios ✏️ |
| `maat_session_brief` | Brief previo: quién asiste y cómo llega cada uno |

### Notificaciones
| Herramienta | Para qué |
|---|---|
| `maat_send_push` | Push a todos o a un grupo ⚠️ *simula por defecto* |

### Reportes y cierre
| Herramienta | Para qué |
|---|---|
| `maat_cohort_report` | Cómo va la cohorte: tasa de cierre, coherencia, fases |
| `maat_feedback_report` | NPS, satisfacción y curva de transformación |
| `maat_list_referrals` | Leads referidos y cuáles faltan pasar al CRM |
| `maat_graduating_soon` | Quién está por terminar y si le falta feedback |

---

## Notas técnicas

- **Zona horaria:** todo se interpreta y muestra en hora de **Colombia (UTC-5)**.
  Al agendar usa `YYYY-MM-DDTHH:MM`, ej. `2026-08-27T19:00`.
- **Transporte:** stdio — corre en tu máquina, nada se expone a internet.
- Tras cambiar el código: `npm run build` y reinicia Claude.

## Si algo falla

| Síntoma | Causa |
|---|---|
| "Faltan credenciales" | `MAAT_EMAIL`/`MAAT_PASSWORD` no llegaron a la config |
| "Invalid login credentials" | Correo o contraseña incorrectos |
| "rol client" | Esa cuenta no es mentor/admin |
| No aparece en Claude | Falta `npm run build`, o la ruta del `args` está mal |
