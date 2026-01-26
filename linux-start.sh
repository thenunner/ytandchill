#!/bin/bash

# ==========================================
# YT and Chill - Unified Linux/macOS Launcher
# ==========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get script directory (works even if called from elsewhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ==========================================
# Helper Functions
# ==========================================

print_header() {
    clear
    echo ""
    echo -e "${CYAN}  ==========================================${NC}"
    echo -e "${CYAN}       YT and Chill - Linux/macOS Launcher${NC}"
    echo -e "${CYAN}  ==========================================${NC}"
    echo ""
}

get_local_version() {
    if [ -f "frontend/package.json" ]; then
        grep '"version"' frontend/package.json | head -1 | sed 's/.*"version".*"\([^"]*\)".*/\1/'
    else
        echo "Unknown"
    fi
}

get_github_version() {
    if command -v curl &> /dev/null; then
        curl -s --max-time 5 https://api.github.com/repos/thenunner/ytandchill/releases/latest 2>/dev/null | \
            grep '"tag_name"' | sed 's/.*"tag_name".*"\([^"]*\)".*/\1/' | sed 's/^v//'
    else
        echo "Unknown"
    fi
}

find_python() {
    # Try python3.12, python3.13, python3.11, then python3
    for cmd in python3.12 python3.13 python3.11 python3 python; do
        if command -v "$cmd" &> /dev/null; then
            version=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
            major=$(echo "$version" | cut -d. -f1)
            minor=$(echo "$version" | cut -d. -f2)
            if [ "$major" = "3" ] && [ "$minor" -ge 11 ] && [ "$minor" -le 13 ]; then
                echo "$cmd"
                return 0
            fi
        fi
    done
    echo ""
    return 1
}

check_dependencies() {
    local missing=()

    # Check Python
    PYTHON_CMD=$(find_python)
    if [ -z "$PYTHON_CMD" ]; then
        missing+=("Python 3.11-3.13")
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing+=("Node.js")
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    fi

    # Check ffmpeg (warning only)
    if ! command -v ffmpeg &> /dev/null; then
        echo -e "${YELLOW}  Warning: ffmpeg not found. Some features may not work.${NC}"
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}  Missing dependencies: ${missing[*]}${NC}"
        echo -e "${YELLOW}  Please install them first or run option [3] Initial Setup.${NC}"
        return 1
    fi

    return 0
}

is_server_running() {
    if [ -f "logs/server.pid" ]; then
        local pid=$(cat logs/server.pid 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# ==========================================
# Menu Functions
# ==========================================

start_server() {
    print_header
    echo -e "${GREEN}  Starting YT and Chill Server...${NC}"
    echo ""

    if ! check_dependencies; then
        echo ""
        read -p "  Press Enter to return to menu..."
        return
    fi

    echo -e "  Using: ${CYAN}$PYTHON_CMD${NC}"
    echo ""

    # Create data directory if needed
    mkdir -p data logs

    # Check if server is already running
    if is_server_running; then
        local pid=$(cat logs/server.pid)
        echo -e "${YELLOW}  Server is already running (PID: $pid)${NC}"
        echo ""
        echo -e "  Options:"
        echo -e "    ${CYAN}1${NC}) View logs"
        echo -e "    ${CYAN}2${NC}) Stop server"
        echo -e "    ${CYAN}3${NC}) Return to menu"
        echo ""
        read -p "  Enter choice (1-3): " subchoice

        case $subchoice in
            1)
                echo ""
                echo -e "${CYAN}  === Recent Logs ===${NC}"
                tail -50 logs/server.log 2>/dev/null || echo "  No logs available yet."
                echo ""
                read -p "  Press Enter to return to menu..."
                ;;
            2)
                echo ""
                echo -e "${YELLOW}  Stopping server...${NC}"
                kill "$pid" 2>/dev/null && rm -f logs/server.pid
                echo -e "${GREEN}  Server stopped.${NC}"
                sleep 1
                ;;
            *)
                return
                ;;
        esac
        return
    fi

    echo -e "  How would you like to run the server?"
    echo ""
    echo -e "    ${CYAN}1${NC}) Background (recommended) - Server runs in background, terminal can be closed"
    echo -e "    ${CYAN}2${NC}) Foreground - Server runs in this terminal (Ctrl+C to stop)"
    echo -e "    ${CYAN}3${NC}) Cancel"
    echo ""
    read -p "  Enter choice (1-3): " runchoice

    case $runchoice in
        1)
            echo ""
            echo -e "${GREEN}  Starting server in background...${NC}"
            nohup $PYTHON_CMD backend/app.py > logs/server.log 2>&1 &
            local pid=$!
            echo "$pid" > logs/server.pid
            sleep 2

            if kill -0 "$pid" 2>/dev/null; then
                echo ""
                echo -e "${GREEN}  ==========================================${NC}"
                echo -e "${GREEN}  Server started successfully!${NC}"
                echo -e "${GREEN}  ==========================================${NC}"
                echo ""
                echo -e "  Server running on: ${CYAN}http://localhost:4099${NC}"
                echo -e "  Process ID: ${CYAN}$pid${NC}"
                echo -e "  Log file: ${CYAN}logs/server.log${NC}"
                echo ""
                echo -e "  To view logs: ${YELLOW}tail -f logs/server.log${NC}"
                echo -e "  To stop server: ${YELLOW}kill $pid${NC} or use menu option"
            else
                echo -e "${RED}  Server failed to start. Check logs/server.log for details.${NC}"
                rm -f logs/server.pid
            fi
            echo ""
            read -p "  Press Enter to return to menu..."
            ;;
        2)
            echo ""
            echo -e "  Server starting on ${CYAN}http://localhost:4099${NC}"
            echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop"
            echo ""
            $PYTHON_CMD backend/app.py
            ;;
        *)
            return
            ;;
    esac
}

update_app() {
    print_header
    echo -e "${GREEN}  ==========================================${NC}"
    echo -e "${GREEN}  Updating YT and Chill...${NC}"
    echo -e "${GREEN}  ==========================================${NC}"
    echo ""

    # Check git
    if ! command -v git &> /dev/null; then
        echo -e "${RED}  ERROR: Git is not installed.${NC}"
        echo -e "  Please install Git first."
        echo ""
        read -p "  Press Enter to return to menu..."
        return
    fi

    # Check if git repo
    if [ ! -d ".git" ]; then
        echo -e "${RED}  ERROR: This is not a git repository.${NC}"
        echo -e "  Please clone the repo first or run Initial Setup."
        echo ""
        read -p "  Press Enter to return to menu..."
        return
    fi

    if ! check_dependencies; then
        echo ""
        read -p "  Press Enter to return to menu..."
        return
    fi

    echo -e "  Pulling latest changes..."
    if ! git pull origin main; then
        echo ""
        echo -e "${YELLOW}  Git pull failed. Trying to stash local changes...${NC}"
        git stash
        if ! git pull origin main; then
            echo -e "${RED}  ERROR: Could not pull updates.${NC}"
            read -p "  Press Enter to return to menu..."
            return
        fi
        echo -e "${YELLOW}  Note: Local changes stashed. Run 'git stash pop' to restore.${NC}"
    fi

    echo ""
    echo -e "  Updating Python dependencies..."
    cd backend
    $PYTHON_CMD -m pip install -r requirements.txt --quiet
    cd ..

    echo ""
    echo -e "  Updating Node dependencies..."
    cd frontend
    npm install --silent

    echo ""
    echo -e "  Rebuilding frontend..."
    npm run build
    cd ..

    echo ""
    echo -e "${GREEN}  ==========================================${NC}"
    echo -e "${GREEN}  Update complete!${NC}"
    echo -e "${GREEN}  ==========================================${NC}"
    echo ""

    # Restart server if running
    if is_server_running; then
        local pid=$(cat logs/server.pid)
        echo -e "${YELLOW}  Restarting server...${NC}"
        kill "$pid" 2>/dev/null
        sleep 2
        nohup $PYTHON_CMD backend/app.py > logs/server.log 2>&1 &
        echo "$!" > logs/server.pid
        echo -e "${GREEN}  Server restarted.${NC}"
    fi

    read -p "  Press Enter to return to menu..."
}

initial_setup() {
    print_header
    echo -e "${GREEN}  ==========================================${NC}"
    echo -e "${GREEN}  YT and Chill - Initial Setup${NC}"
    echo -e "${GREEN}  ==========================================${NC}"
    echo ""

    # Find Python
    PYTHON_CMD=$(find_python)
    if [ -z "$PYTHON_CMD" ]; then
        echo -e "${RED}  No compatible Python found (need 3.11-3.13)${NC}"
        echo ""
        echo -e "  Please install Python 3.11, 3.12, or 3.13:"
        echo ""
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo -e "    ${CYAN}brew install python@3.12${NC}"
        else
            echo -e "    ${CYAN}sudo apt install python3.12 python3.12-venv${NC}  (Debian/Ubuntu)"
            echo -e "    ${CYAN}sudo dnf install python3.12${NC}  (Fedora)"
            echo -e "    ${CYAN}sudo pacman -S python${NC}  (Arch)"
        fi
        echo ""
        read -p "  Press Enter to return to menu..."
        return
    fi

    echo -e "  Found Python: ${CYAN}$PYTHON_CMD${NC}"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}  Node.js not found.${NC}"
        echo ""
        echo -e "  Please install Node.js:"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo -e "    ${CYAN}brew install node${NC}"
        else
            echo -e "    ${CYAN}sudo apt install nodejs npm${NC}  (Debian/Ubuntu)"
            echo -e "    ${CYAN}sudo dnf install nodejs npm${NC}  (Fedora)"
            echo -e "    ${CYAN}sudo pacman -S nodejs npm${NC}  (Arch)"
        fi
        echo ""
        read -p "  Press Enter to return to menu..."
        return
    fi
    echo -e "  Found Node.js: ${CYAN}$(node --version)${NC}"

    # Check ffmpeg
    if ! command -v ffmpeg &> /dev/null; then
        echo -e "${YELLOW}  Warning: ffmpeg not found. Installing is recommended.${NC}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo -e "    ${CYAN}brew install ffmpeg${NC}"
        else
            echo -e "    ${CYAN}sudo apt install ffmpeg${NC}  (Debian/Ubuntu)"
        fi
    else
        echo -e "  Found ffmpeg: ${CYAN}$(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f3)${NC}"
    fi

    # Check/install CA certificates (Linux only - needed for SSL/thumbnail downloads)
    if [[ "$OSTYPE" != "darwin"* ]]; then
        if ! dpkg -l ca-certificates &> /dev/null 2>&1; then
            echo ""
            echo -e "${YELLOW}  Installing CA certificates for SSL support...${NC}"
            if sudo apt-get update -qq && sudo apt-get install -y -qq ca-certificates; then
                sudo update-ca-certificates
                echo -e "${GREEN}  CA certificates installed.${NC}"
            else
                echo -e "${YELLOW}  Warning: Could not install ca-certificates. Thumbnail downloads may fail.${NC}"
            fi
        else
            echo -e "  Found CA certificates: ${CYAN}installed${NC}"
        fi
    fi

    echo ""
    echo -e "  Creating directories..."
    mkdir -p data downloads downloads/imports logs

    echo ""
    echo -e "  Installing Python dependencies..."
    cd backend
    $PYTHON_CMD -m pip install -r requirements.txt
    $PYTHON_CMD -m pip install --upgrade certifi --quiet
    cd ..

    echo ""
    echo -e "  Installing Node.js dependencies..."
    cd frontend
    npm install

    echo ""
    echo -e "  Building frontend..."
    npm run build
    cd ..

    echo ""
    echo -e "  Creating cookies.txt placeholder..."
    touch data/cookies.txt

    echo ""
    echo -e "${GREEN}  ==========================================${NC}"
    echo -e "${GREEN}  Setup complete!${NC}"
    echo -e "${GREEN}  ==========================================${NC}"
    echo ""
    echo -e "  Select option ${CYAN}1${NC} from the menu to start the server."
    echo ""
    read -p "  Press Enter to return to menu..."
}

stop_server() {
    if is_server_running; then
        local pid=$(cat logs/server.pid)
        echo -e "${YELLOW}  Stopping server (PID: $pid)...${NC}"
        kill "$pid" 2>/dev/null
        rm -f logs/server.pid
        echo -e "${GREEN}  Server stopped.${NC}"
    else
        echo -e "${YELLOW}  Server is not running.${NC}"
    fi
    sleep 1
}

# ==========================================
# Main Menu Loop
# ==========================================

while true; do
    print_header

    # Get versions
    LOCAL_VERSION=$(get_local_version)
    GITHUB_VERSION=$(get_github_version)

    # Check for update
    UPDATE_MSG=""
    if [ "$GITHUB_VERSION" != "Unknown" ] && [ "$LOCAL_VERSION" != "Unknown" ]; then
        if [ "$GITHUB_VERSION" != "$LOCAL_VERSION" ] && [ "$GITHUB_VERSION" != "v$LOCAL_VERSION" ]; then
            UPDATE_MSG="${YELLOW}  [UPDATE AVAILABLE]${NC}"
        fi
    fi

    # Server status
    if is_server_running; then
        SERVER_STATUS="${GREEN}Running${NC} (PID: $(cat logs/server.pid))"
    else
        SERVER_STATUS="${RED}Stopped${NC}"
    fi

    echo -e "    Installed: ${CYAN}v$LOCAL_VERSION${NC}"
    echo -e "    GitHub:    ${CYAN}$GITHUB_VERSION${NC} $UPDATE_MSG"
    echo -e "    Server:    $SERVER_STATUS"
    echo ""
    echo -e "  ------------------------------------------"
    echo ""
    echo -e "    ${CYAN}[1]${NC} Start Server"
    echo -e "    ${CYAN}[2]${NC} Update (git pull + rebuild)"
    echo -e "    ${CYAN}[3]${NC} Initial Setup (first time only)"
    echo -e "    ${CYAN}[4]${NC} Stop Server"
    echo -e "    ${CYAN}[5]${NC} Exit"
    echo ""
    echo -e "  ------------------------------------------"
    echo ""
    read -p "  Enter choice (1-5): " choice

    case $choice in
        1) start_server ;;
        2) update_app ;;
        3) initial_setup ;;
        4) stop_server ;;
        5)
            echo ""
            echo -e "${GREEN}  Goodbye!${NC}"
            echo ""
            exit 0
            ;;
        *)
            echo ""
            echo -e "${RED}  Invalid choice. Please enter 1-5.${NC}"
            sleep 1
            ;;
    esac
done
