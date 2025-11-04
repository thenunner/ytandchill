#!/bin/bash
set -e

echo "=========================================="
echo "YT and Chill - Native Linux Setup"
echo "(No Docker Required)"
echo "=========================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 is not installed"
    echo "Install with: sudo apt install python3 python3-pip (Ubuntu/Debian)"
    echo "           or: sudo dnf install python3 python3-pip (Fedora)"
    echo "           or: sudo pacman -S python python-pip (Arch)"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "Found Python $PYTHON_VERSION"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Install with: sudo apt install nodejs npm (Ubuntu/Debian)"
    echo "           or: sudo dnf install nodejs npm (Fedora)"
    echo "           or: sudo pacman -S nodejs npm (Arch)"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "Found Node.js $NODE_VERSION"

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "WARNING: ffmpeg is not installed"
    echo "Install with: sudo apt install ffmpeg (Ubuntu/Debian)"
    echo "           or: sudo dnf install ffmpeg (Fedora)"
    echo "           or: sudo pacman -S ffmpeg (Arch)"
    echo ""
    echo "You can continue without it, but some features may not work."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "Creating required directories..."
mkdir -p data downloads logs

echo ""
echo "Installing Python dependencies..."
cd backend
pip3 install -r requirements.txt --user
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Python dependencies"
    exit 1
fi
cd ..

echo ""
echo "Installing Node.js dependencies..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Node.js dependencies"
    exit 1
fi

echo ""
echo "Building frontend..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build frontend"
    exit 1
fi
cd ..

echo ""
echo "Creating empty cookies.txt file (optional)..."
if [ ! -f cookies.txt ]; then
    touch cookies.txt
    echo "Created empty cookies.txt"
else
    echo "cookies.txt already exists"
fi

# Set permissions
chmod -R 755 data downloads logs

echo ""
echo "=========================================="
echo "Setup complete!"
echo "=========================================="
echo ""
echo "To start the application:"
echo "  ./start-native-linux.sh"
echo ""
echo "Or manually:"
echo "  cd backend"
echo "  python3 app.py"
echo ""
echo "Then access at: http://localhost:4099"
echo ""
