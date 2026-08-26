#!/bin/bash
# =====================================================
# MAAT - Guarda del project-ref de Supabase (hook PreToolUse)
# =====================================================
# Claude Code lo invoca antes de CADA comando Bash y le pasa por stdin
#   {"tool_name":"Bash","tool_input":{"command":"..."}}
# Si el comando despliega algo a Supabase, verifica que el destino sea MAAT.
#   exit 0 -> el comando sigue su curso (caso normal, invisible)
#   exit 2 -> se aborta el comando y stderr vuelve al modelo como instruccion
# Cualquier otro codigo seria un error del hook, no un bloqueo: por eso NO
# usamos 'set -e' (un grep sin match no debe convertirse en salida 1).
# =====================================================

MAAT_REF="pcclptmojjzqmfmzftot"
CRM_REF="vbfesmgxegxsurnfazjs"

# El ref real vive donde el CLI de Supabase lo guarda, relativo al repo,
# no al cwd del hook (que es la carpeta del proyecto, un nivel arriba).
REPO="$(cd "$(dirname "$0")/.." && pwd)"
REF_FILE="$REPO/supabase/.temp/project-ref"

if ! command -v jq >/dev/null 2>&1; then
  echo "guard_supabase_ref: falta jq (brew install jq); no puedo validar el deploy" >&2
  exit 2
fi

CMD="$(jq -r '.tool_input.command // ""')"

# Solo nos importan los comandos que ESCRIBEN en un proyecto remoto, y solo
# cuando 'supabase' es el comando que corre - no cuando aparece dentro de un
# echo, un grep o un heredoc. Por eso partimos en segmentos por separador de
# shell y exigimos que el segmento EMPIECE por supabase.
ACTS=0
SEG_HIT=""
while IFS= read -r seg; do
  if echo "$seg" | grep -qE '^[[:space:]]*(npx[[:space:]]+)?supabase[[:space:]]+(functions[[:space:]]+deploy|db[[:space:]]+push|secrets[[:space:]]+set)'; then
    ACTS=1
    SEG_HIT="$seg"
    break
  fi
done <<< "$(echo "$CMD" | tr ';|&' '\n')"

[ "$ACTS" = "0" ] && exit 0

# Un --project-ref explicito gana sobre el link: hay que mirarlo primero
# El flag se lee del segmento que disparo, no del comando entero (si no, un
# comando con varias invocaciones devolvia varios refs pegados).
FLAG_REF="$(echo "$SEG_HIT" | sed -nE 's/.*--project-ref[= ]+([a-z]{20}).*/\1/p' | head -1)"
LINKED="$(cat "$REF_FILE" 2>/dev/null | tr -d '[:space:]')"
TARGET="${FLAG_REF:-$LINKED}"

if [ "$TARGET" = "$MAAT_REF" ]; then
  exit 0
fi

if [ -z "$TARGET" ]; then
  echo "BLOQUEADO: no hay proyecto Supabase enlazado, el deploy no tiene destino seguro." >&2
else
  echo "BLOQUEADO: este comando iria a '$TARGET', que NO es MAAT ($MAAT_REF)." >&2
  [ "$TARGET" = "$CRM_REF" ] && echo "Ese ref es el CRM: es un proyecto Supabase distinto, ahi no van las funciones de MAAT." >&2
fi
echo "Corre primero: supabase link --project-ref $MAAT_REF (y confirma el output) antes de reintentar." >&2
exit 2
