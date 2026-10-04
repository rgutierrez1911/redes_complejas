#!/usr/bin/env bash
set -e

# Directorio raíz del proyecto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================="
echo "🚀 Iniciando proceso de Build del Proyecto"
echo "=========================================="

# 1. Configuración del entorno virtual Python (Python 3.12)
echo ""
echo "🐍 [1/2] Configurando entorno virtual Python 3.12 (.venv)..."

# Detectar binario python3.12 o python3
PYTHON_BIN=""
if command -v python3.12 >/dev/null 2>&1; then
    PYTHON_BIN="python3.12"
elif command -v python3 >/dev/null 2>&1; then
    PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    if [ "$PY_VER" = "3.12" ]; then
        PYTHON_BIN="python3"
    fi
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "❌ Error: python3.12 no está instalado o no se encuentra en el PATH."
    exit 1
fi

echo "ℹ️ Usando binario Python: $($PYTHON_BIN --version) ($PYTHON_BIN)"

if [ ! -d ".venv" ]; then
    echo "⚙️ Creando entorno virtual .venv con $PYTHON_BIN..."
    "$PYTHON_BIN" -m venv .venv
fi

echo "⚙️ Actualizando pip e instalando dependencias de Python..."
.venv/bin/python -m pip install --upgrade pip 
.venv/bin/python -m pip install -r requirements.txt  
echo "✅ Entorno Python listo."

# 2. Configuración y compilación del Frontend
echo ""
echo "📦 [2/2] Configurando y compilando Frontend (SolidJS + Vite)..."

if [ ! -d "node_modules" ]; then
    echo "⚙️ Instalando dependencias de Node en la raíz..."
    npm install
fi

echo "🔨 Ejecutando build del frontend..."
npm run build

echo ""
echo "=========================================="
echo "🎉 ¡Build completado con éxito!"
echo "   - Python .venv: $(.venv/bin/python --version)"
echo "   - Frontend: dist/ listo en frontend/dist"
echo ""
echo "👉 Opciones para iniciar la aplicación:"
echo ""
echo "   Opción A: Frontend SolidJS + Backend FastAPI (Recomendado para producción)"
echo "   source .venv/bin/activate"
echo "   uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"
echo "   -> Acceso: http://localhost:8000"
echo ""
echo "   Opción B: Frontend Alternativo Streamlit (100% Python)"
echo "   source .venv/bin/activate"
echo "   streamlit run streamlit_app.py --server.port 8501"
echo "   -> Acceso: http://localhost:8501"
echo "=========================================="


#rsync -av --exclude='node_modules' --exclude='.venv' --exclude='__pycache__' ./ /mnt/d/pry/redes_complejas_trabajo_final
