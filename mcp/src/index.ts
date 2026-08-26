#!/usr/bin/env node
/**
 * Servidor MCP de MAAT — da a Claude acceso a la mentoria.
 *
 * Transporte: stdio (corre local, en tu maquina).
 * Auth: credenciales del mentor -> las policies RLS siguen aplicando.
 *       El agente NO puede hacer nada que tu no pudieras hacer en el portal.
 *
 * Config (Claude Code / Claude Desktop):
 *   {
 *     "mcpServers": {
 *       "maat": {
 *         "command": "node",
 *         "args": ["<ruta>/Maat_app/mcp/dist/index.js"],
 *         "env": { "MAAT_EMAIL": "...", "MAAT_PASSWORD": "..." }
 *       }
 *     }
 *   }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerClientes } from "./tools/clientes.js";
import { registerSesiones } from "./tools/sesiones.js";
import { registerNotificaciones } from "./tools/notificaciones.js";
import { registerReportes } from "./tools/reportes.js";

const server = new McpServer(
  { name: "maat", version: "1.0.0" },
  {
    instructions:
      "Herramientas de la mentoria MAAT (proceso de 16 semanas). " +
      "El ritual diario del cliente es NOCTURNO: cierra el dia (que hizo, que le falto, que agradece, " +
      "termometro de coherencia 1-10, aprendizaje) y elige lo mas importante de manana; por la manana lee su " +
      "statement y escucha su autohipnosis. " +
      "Empieza por maat_list_clients o maat_cohort_report para orientarte. " +
      "maat_send_push alcanza a personas reales y no se puede deshacer: simula primero (sin confirm), " +
      "muestra el resultado al usuario y solo envia con su aprobacion explicita.",
  },
);

registerClientes(server);
registerSesiones(server);
registerNotificaciones(server);
registerReportes(server);

const transport = new StdioServerTransport();
await server.connect(transport);
