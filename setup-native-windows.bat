@echo off
echo ==========================================
echo YT and Chill - Native Windows Setup
echo (No Docker Required)
echo ==========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed
    echo Please install Python 3.11+ from https://www.python.org/
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if ffmpeg is installed
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo WARNING: ffmpeg is not installed
    echo Install ffmpeg from https://ffmpeg.org/ for video processing
    echo You can continue without it, but some features may not work.
    pause
)

echo.
echo Creating required directories...
if not exist data mkdir data
if not exist downloads mkdir downloads
if not exist logs mkdir logs

echo.
echo Installing Python dependencies...
cd backend
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)
cd ..

echo.
echo Installing Node.js dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install Node.js dependencies
    pause
    exit /b 1
)

echo.
echo Building frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Failed to build frontend
    pause
    exit /b 1
)
cd ..

echo.
echo Creating empty cookies.txt file (optional)...
if not exist cookies.txt (
    type nul > cookies.txt
    echo Created empty cookies.txt
) else (
    echo cookies.txt already exists
)

echo.
echo ==========================================
echo Setup complete!
echo ==========================================
echo.
echo To start the application:
echo   start-native-windows.bat
echo.
echo Or manually:
echo   cd backend
echo   python app.py
echo.
echo Then access at: http://localhost:4099
echo.
pause
