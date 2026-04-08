#!/bin/bash
echo "🔍 Verificando estructura del proyecto MAAT..."
echo ""
FILES=("CLAUDE.md" "docs/ARQUITECTURA.md" "src/maat_dashboard.html" "src/maat_mentor_dashboard.html")
MISSING=0
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    LINES=$(wc -l < "$f")
    SIZE=$(du -h "$f" | cut -f1)
    echo "  ✅ $f ($LINES líneas, $SIZE)"
  else
    echo "  ❌ $f — FALTANTE"
    MISSING=$((MISSING+1))
  fi
done
echo ""
OPTIONAL=("sql/maat_setup_master.sql" "supabase/functions/coach-maat/index.ts" "src/sw.js")
for f in "${OPTIONAL[@]}"; do
  if [ -f "$f" ]; then echo "  📄 $f (presente)"
  else echo "  ⏳ $f (pendiente)"
  fi
done
echo ""
if [ $MISSING -eq 0 ]; then
  echo "✅ Proyecto listo para Claude Code."
  echo "   Ejecuta: claude"
else
  echo "⚠️  Faltan $MISSING archivo(s)."
  if [ ! -f "src/maat_dashboard.html" ]; then
    echo "   → Copia maat_dashboard.html a src/"
  fi
fi
