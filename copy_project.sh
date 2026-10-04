#!/usr/bin/env bash
set -e

# Directorio raíz del proyecto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEST_PATH="$1"

if [ -z "$DEST_PATH" ]; then
    echo "❌ Error: Debes especificar la ruta de destino."
    echo ""
    echo "Uso:"
    echo "  $0 <ruta_destino>"
    echo ""
    echo "Ejemplo:"
    echo "  $0 /mnt/d/pry/redes_complejas_trabajo_final"
    exit 1
fi

# Crear directorio de destino si no existe
mkdir -p "$DEST_PATH"

echo "=========================================="
echo "📦 Copiando proyecto"
echo "   Origen:  $PROJECT_ROOT"
echo "   Destino: $DEST_PATH"
echo "   Filtros: Excluyendo .venv, node_modules, __pycache__"
echo "=========================================="

rsync -av \
  --exclude='node_modules' \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='.tmp' \
  "$PROJECT_ROOT/" "$DEST_PATH/"

echo ""
echo "✅ ¡Copia completada exitosamente en $DEST_PATH!"
