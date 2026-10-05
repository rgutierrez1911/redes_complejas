#!/usr/bin/env bash
# ==============================================================================
# AeroHand AI - Script de Compilación y Configuración Multiplataforma
# Soporta: Git Bash (Windows), Linux, macOS
# ==============================================================================
set -e

# Directorio raíz del proyecto (ruta absoluta en formato unix/bash)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

START_SERVER=false
START_STREAMLIT=false

for arg in "$@"; do
    case "$arg" in
        --start|--serve|-s)
            START_SERVER=true
            ;;
        --streamlit)
            START_STREAMLIT=true
            ;;
        --help|-h)
            echo "=========================================================="
            echo "⚙️  AeroHand AI - Opciones de Build"
            echo "=========================================================="
            echo "Uso: ./build.sh [OPCIONES]"
            echo ""
            echo "Opciones:"
            echo "  --start, --serve, -s   Inicia el servidor Uvicorn (FastAPI + SPA) tras compilar"
            echo "  --streamlit            Inicia la interfaz alternativa Streamlit tras compilar"
            echo "  --help, -h             Muestra esta información de ayuda"
            echo "=========================================================="
            exit 0
            ;;
    esac
done

echo "=========================================================="
echo "🚀 Iniciando proceso de Build del Proyecto"
echo "=========================================================="

# 0. Detección de Plataforma / Sistema Operativo
OS_NAME="$(uname -s 2>/dev/null || echo "Unknown")"
IS_WINDOWS=false

case "$OS_NAME" in
    MINGW*|MSYS*|CYGWIN*)
        IS_WINDOWS=true
        PLATFORM_LABEL="Windows (Git Bash / MSYS)"
        ;;
    Darwin*)
        PLATFORM_LABEL="macOS"
        ;;
    Linux*)
        PLATFORM_LABEL="Linux"
        ;;
    *)
        # Verificación de respaldo para entornos Windows con emuladores bash
        if [ -n "$WINDIR" ] || [ -n "$SYSTEMROOT" ] || [ "$OSTYPE" = "msys" ]; then
            IS_WINDOWS=true
            PLATFORM_LABEL="Windows ($OS_NAME)"
        else
            PLATFORM_LABEL="Unix ($OS_NAME)"
        fi
        ;;
esac

echo "💻 Entorno detectado: $PLATFORM_LABEL"

# 1. Detección de Python 3.12
echo ""
echo "🐍 [1/2] Verificando Python 3.12 y configurando entorno virtual (.venv)..."

PYTHON_CMD=""

find_python312() {
    local candidates=()

    if [ "$IS_WINDOWS" = true ]; then
        candidates=(
            "py -3.12"
            "py.exe -3.12"
            "python3.12"
            "python3"
            "python"
            "$LOCALAPPDATA/Programs/Python/Python312/python.exe"
            "$USERPROFILE/AppData/Local/Programs/Python/Python312/python.exe"
            "/c/Users/$USER/AppData/Local/Programs/Python/Python312/python.exe"
            "/c/Program Files/Python312/python.exe"
            "/c/Program Files (x86)/Python312/python.exe"
            "/c/Python312/python.exe"
        )
    else
        candidates=(
            "python3.12"
            "python3"
            "python"
            "/usr/bin/python3.12"
            "/usr/local/bin/python3.12"
            "/opt/homebrew/bin/python3.12"
        )
    fi

    for cand in "${candidates[@]}"; do
        if [ -z "$cand" ]; then
            continue
        fi

        # Evaluar si el candidato ejecuta y reporta versión 3.12
        if eval "$cand -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)'" >/dev/null 2>&1; then
            PYTHON_CMD="$cand"
            return 0
        fi
    done

    PYTHON_CMD=""
    return 1
}

install_python312() {
    echo "⚠️ Python 3.12 no fue detectado en el sistema."
    echo "🔄 Intentando instalar Python 3.12 automáticamente..."

    local install_attempted=false

    if [ "$IS_WINDOWS" = true ]; then
        if command -v winget.exe >/dev/null 2>&1 || command -v winget >/dev/null 2>&1; then
            echo "📦 [winget] Instalando Python.Python.3.12..."
            winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements || winget install -e --id Python.Python.3.12 || true
            install_attempted=true
        elif command -v choco.exe >/dev/null 2>&1 || command -v choco >/dev/null 2>&1; then
            echo "📦 [Chocolatey] Instalando Python 3.12..."
            choco install python --version=3.12.10 -y || choco install python312 -y || true
            install_attempted=true
        elif command -v scoop >/dev/null 2>&1; then
            echo "📦 [Scoop] Instalando python@3.12..."
            scoop install python@3.12 || true
            install_attempted=true
        fi
    else
        if command -v apt-get >/dev/null 2>&1; then
            echo "📦 [apt] Instalando python3.12 y python3.12-venv..."
            sudo apt-get update && sudo apt-get install -y python3.12 python3.12-venv python3.12-dev || true
            install_attempted=true
        elif command -v dnf >/dev/null 2>&1; then
            echo "📦 [dnf] Instalando python3.12..."
            sudo dnf install -y python3.12 python3.12-devel || true
            install_attempted=true
        elif command -v yum >/dev/null 2>&1; then
            echo "📦 [yum] Instalando python3.12..."
            sudo yum install -y python3.12 || true
            install_attempted=true
        elif command -v pacman >/dev/null 2>&1; then
            echo "📦 [pacman] Instalando python..."
            sudo pacman -S --noconfirm python || true
            install_attempted=true
        elif command -v brew >/dev/null 2>&1; then
            echo "📦 [Homebrew] Instalando python@3.12..."
            brew install python@3.12 || true
            install_attempted=true
        fi
    fi

    # Verificar si tras la instalación ya se encuentra Python 3.12
    if find_python312; then
        echo "✅ Python 3.12 instalado y verificado exitosamente."
        return 0
    fi

    echo ""
    echo "❌ ERROR: No se encontró Python 3.12 ni se pudo instalar automáticamente."
    echo "=========================================================="
    echo "👉 Por favor instala Python 3.12 manualmente desde:"
    echo "   🔗 https://www.python.org/downloads/release/python-31210/"
    if [ "$IS_WINDOWS" = true ]; then
        echo "   ⚠️ IMPORTANTE: Marca la casilla 'Add python.exe to PATH' en el instalador."
    fi
    echo "=========================================================="
    exit 1
}

# Comprobar o instalar Python 3.12
if ! find_python312; then
    install_python312
fi

PY_VERSION_DISPLAY=$(eval "$PYTHON_CMD --version" 2>&1)
echo "ℹ️  Usando intérprete Python: $PY_VERSION_DISPLAY ($PYTHON_CMD)"

# Validar estado de .venv si ya existe
if [ -d ".venv" ]; then
    VENV_IS_VALID=false
    if [ "$IS_WINDOWS" = true ] && [ -f ".venv/Scripts/python.exe" ]; then
        if .venv/Scripts/python.exe -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)' >/dev/null 2>&1; then
            VENV_IS_VALID=true
        fi
    elif [ "$IS_WINDOWS" = false ] && [ -f ".venv/bin/python" ]; then
        if .venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)' >/dev/null 2>&1; then
            VENV_IS_VALID=true
        fi
    fi

    if [ "$VENV_IS_VALID" = false ]; then
        echo "⚠️  El entorno .venv existente es incompatible (ej. creado en otro SO o con versión distinta a 3.12)."
        echo "🔄 Recreando entorno virtual .venv limpio con Python 3.12..."
        rm -rf .venv
    fi
fi

# Crear .venv si no existe
if [ ! -d ".venv" ]; then
    echo "⚙️  Creando entorno virtual .venv con $PYTHON_CMD..."
    eval "$PYTHON_CMD -m venv .venv"
fi

# Asignar rutas del entorno virtual según la estructura del SO
if [ "$IS_WINDOWS" = true ]; then
    VENV_PYTHON=".venv/Scripts/python.exe"
    VENV_ACTIVATE=".venv/Scripts/activate"
    
    # Crear carpeta .venv/bin con shims para compatibilidad cruzada en Git Bash / scripts npm
    mkdir -p .venv/bin
    cat << 'SHIM_PY' > .venv/bin/python
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/../Scripts/python.exe" "$@"
SHIM_PY
    chmod +x .venv/bin/python 2>/dev/null || true

    cat << 'SHIM_PY_CMD' > .venv/bin/python.cmd
@echo off
"%~dp0..\Scripts\python.exe" %*
SHIM_PY_CMD

    cat << 'SHIM_UVI' > .venv/bin/uvicorn
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/../Scripts/uvicorn.exe" "$@"
SHIM_UVI
    chmod +x .venv/bin/uvicorn 2>/dev/null || true

    cat << 'SHIM_UVI_CMD' > .venv/bin/uvicorn.cmd
@echo off
"%~dp0..\Scripts\uvicorn.exe" %*
SHIM_UVI_CMD

    cat << 'SHIM_STR' > .venv/bin/streamlit
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/../Scripts/streamlit.exe" "$@"
SHIM_STR
    chmod +x .venv/bin/streamlit 2>/dev/null || true

    cat << 'SHIM_STR_CMD' > .venv/bin/streamlit.cmd
@echo off
"%~dp0..\Scripts\streamlit.exe" %*
SHIM_STR_CMD

    cat << 'SHIM_ACT' > .venv/bin/activate
ACT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ACT_DIR/../Scripts/activate"
SHIM_ACT
else
    VENV_PYTHON=".venv/bin/python"
    VENV_ACTIVATE=".venv/bin/activate"
fi

echo "⚙️  Actualizando pip e instalando dependencias desde requirements.txt..."
"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r requirements.txt
echo "✅ Entorno virtual Python listo ($("$VENV_PYTHON" --version))."

# 2. Configuración y compilación del Frontend SPA
echo ""
echo "📦 [2/2] Configurando y compilando Frontend SPA (SolidJS + TypeScript + Vite)..."

if ! command -v npm >/dev/null 2>&1; then
    echo "❌ ERROR: Node.js / npm no está instalado en el sistema."
    echo "👉 Por favor instala Node.js LTS desde https://nodejs.org/"
    exit 1
fi

if [ ! -d "node_modules" ] || [ ! -d "frontend/node_modules" ]; then
    echo "⚙️  Instalando dependencias de Node..."
    npm install
fi

echo "🔨 Compilando el SPA de Frontend (npm run build)..."
npm run build

if [ ! -f "frontend/dist/index.html" ]; then
    echo "❌ ERROR: La compilación del frontend falló. No se generó frontend/dist/index.html"
    exit 1
fi

echo "✅ Frontend SPA compilado exitosamente en frontend/dist"

echo ""
echo "=========================================================="
echo "🎉 ¡Build completado con éxito!"
echo "   - Python .venv: $("$VENV_PYTHON" --version)"
echo "   - Frontend SPA: frontend/dist/ (Listo para producción)"
echo "=========================================================="

# 3. Arranque del servidor Uvicorn si fue solicitado
if [ "$START_SERVER" = true ]; then
    echo ""
    echo "🦄 Iniciando servidor Uvicorn (FastAPI + SPA SolidJS)..."
    echo "🌐 URL: http://localhost:8000"
    echo "=========================================================="
    exec "$VENV_PYTHON" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
elif [ "$START_STREAMLIT" = true ]; then
    echo ""
    echo "🎈 Iniciando servidor Streamlit..."
    echo "🌐 URL: http://localhost:8501"
    echo "=========================================================="
    exec "$VENV_PYTHON" -m streamlit run streamlit_app.py --server.port 8501
else
    echo ""
    echo "👉 Comandos para iniciar la aplicación:"
    echo ""
    echo "   [Opción 1] Servidor Uvicorn con Frontend SPA (SolidJS + FastAPI):"
    echo "     source $VENV_ACTIVATE"
    echo "     uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"
    echo "     (O ejecuta directamente: ./build.sh --start)"
    echo ""
    echo "   [Opción 2] Frontend Alternativo Streamlit (100% Python):"
    echo "     source $VENV_ACTIVATE"
    echo "     streamlit run streamlit_app.py --server.port 8501"
    echo "     (O ejecuta directamente: ./build.sh --streamlit)"
    echo "=========================================================="
fi
