# Instrucciones para configurar el proyecto en Claude Code

## Paso 1: Descargar este paquete ZIP

Descarga el archivo `maat-project.zip` y descomprímelo en tu máquina.

## Paso 2: Colocar tus archivos HTML

Copia tus dos archivos HTML actuales a la carpeta `src/`:

```
maat-project/src/maat_dashboard.html          ← Tu app del cliente
maat-project/src/maat_mentor_dashboard.html   ← Tu portal del mentor
```

## Paso 3: Verificar la estructura

```bash
cd maat-project
bash setup.sh
```

Deberías ver todos los archivos marcados con ✅.

## Paso 4: Iniciar Claude Code

```bash
cd maat-project
claude
```

Claude Code leerá `CLAUDE.md` automáticamente y tendrá todo el contexto del proyecto — la arquitectura completa, las reglas, el esquema de BD, los patrones de código, y las vistas de ambas apps.

## Paso 5: Empezar a optimizar

Puedes pedirle cosas como:
- "Revisa el maat_dashboard.html y lista bugs o mejoras"
- "Crea el archivo SQL maestro basándote en CLAUDE.md"
- "Optimiza el renderHome() del dashboard del cliente"
- "Implementa la Edge Function coach-maat"
- "Agrega lazy loading a las vistas del portal del mentor"

Claude Code tendrá acceso a los archivos reales + todo el contexto de CLAUDE.md.
