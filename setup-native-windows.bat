@echo off
echo ==========================================
echo YT and Chill - Native Windows Setup
echo (No Docker Required)
echo ==========================================
echo.

REM Find a compatible Python version (3.11, 3.12, or 3.13)
REM Python 3.14+ has compatibility issues with SQLAlchemy
set PYTHON_CMD=

REM Try py launcher with specific versions first
py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.12
    goto :python_found
)

py -3.13 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.13
    goto :python_found
)

py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.11
    goto :python_found
)

REM Check default python version
python --version 2>&1 | findstr /R "3\.11\. 3\.12\. 3\.13\." >nul
if not errorlevel 1 (
    set PYTHON_CMD=python
    goto :python_found
)

REM No compatible version found - check if Python 3.14+ is installed
python --version >nul 2>&1
if not errorlevel 1 (
    echo.
    echo WARNING: Python 3.14+ detected but not supported yet.
    echo SQLAlchemy requires Python 3.11-3.13.
    echo.
    goto :install_python
)

echo.
echo No Python installation found.
echo.

:install_python
echo Installing Python 3.12 via winget...
echo.
winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install Python 3.12 automatically.
    echo Please install manually from:
    echo   https://www.python.org/downloads/release/python-3129/
    echo.
    echo During installation, check "Add Python to PATH"
    pause
    exit /b 1
)

echo.
echo Python 3.12 installed successfully!
echo.
echo IMPORTANT: Please close this window and run setup-native-windows.bat again
echo to use the newly installed Python.
echo.
pause
exit /b 0

:python_found
echo Found compatible Python: %PYTHON_CMD%
%PYTHON_CMD% --version
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed
    echo.
    echo Installing Node.js via winget...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install Node.js automatically.
        echo Please install manually from https://nodejs.org/
        pause
        exit /b 1
    )
    echo.
    echo Node.js installed! Please close this window and run setup again.
    pause
    exit /b 0
)

REM Check if ffmpeg is installed
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo WARNING: ffmpeg is not installed
    echo.
    echo Installing ffmpeg via winget...
    winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo.
        echo WARNING: Could not install ffmpeg automatically.
        echo Some features may not work. You can install it manually later.
        echo.
    ) else (
        echo ffmpeg installed!
    )
)

echo.
echo Creating required directories...
if not exist data mkdir data
if not exist downloads mkdir downloads
if not exist logs mkdir logs

echo.
echo Installing Python dependencies...
cd backend
%PYTHON_CMD% -m pip install -r requirements.txt
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
if not exist backend\cookies.txt (
    type nul > backend\cookies.txt
    echo Created empty backend\cookies.txt
) else (
    echo backend\cookies.txt already exists
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
echo   %PYTHON_CMD% app.py
echo.
echo Then access at: http://localhost:4099
echo.
pause
