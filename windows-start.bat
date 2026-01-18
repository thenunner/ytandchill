@echo off
setlocal enabledelayedexpansion

REM ==========================================
REM YT and Chill - Unified Windows Launcher
REM ==========================================

:menu
cls
echo.
echo  ==========================================
echo       YT and Chill - Windows Launcher
echo  ==========================================
echo.

REM Get local version from package.json
set LOCAL_VERSION=Unknown
if exist frontend\package.json (
    for /f "tokens=2 delims=:," %%a in ('findstr /c:"\"version\"" frontend\package.json') do (
        set "ver=%%a"
        set "ver=!ver:"=!"
        set "ver=!ver: =!"
        set LOCAL_VERSION=!ver!
    )
)

REM Get GitHub version (requires curl, available in Windows 10+)
set GITHUB_VERSION=Unknown
set UPDATE_MSG=
curl --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=2 delims=:," %%a in ('curl -s --max-time 5 https://api.github.com/repos/thenunner/ytandchill/releases/latest 2^>nul ^| findstr /c:"\"tag_name\""') do (
        set "gver=%%a"
        set "gver=!gver:"=!"
        set "gver=!gver: =!"
        set GITHUB_VERSION=!gver!
    )
)

REM Compare versions
if not "!GITHUB_VERSION!"=="Unknown" (
    if not "!LOCAL_VERSION!"=="!GITHUB_VERSION!" (
        if not "v!LOCAL_VERSION!"=="!GITHUB_VERSION!" (
            set "UPDATE_MSG=  [UPDATE AVAILABLE]"
        )
    )
)

echo    Installed: v%LOCAL_VERSION%
echo    GitHub:    %GITHUB_VERSION%%UPDATE_MSG%
echo.
echo  ------------------------------------------
echo.
echo    [1] Start Server
echo    [2] Update (git pull + rebuild)
echo    [3] Initial Setup (first time only)
echo    [4] Exit
echo.
echo  ------------------------------------------
echo.

set /p choice="  Enter choice (1-4): "

if "%choice%"=="1" goto start_server
if "%choice%"=="2" goto update
if "%choice%"=="3" goto setup
if "%choice%"=="4" goto end

echo.
echo  Invalid choice. Please enter 1-4.
timeout /t 2 >nul
goto menu

REM ==========================================
REM OPTION 1: Start Server
REM ==========================================
:start_server
cls
echo.
echo  Starting YT and Chill Server...
echo.

call :find_python
if "!PYTHON_CMD!"=="" (
    echo  ERROR: No compatible Python found. Run Setup first.
    pause
    goto menu
)

echo  Using: !PYTHON_CMD!
echo.

REM Ensure we're in the project root
cd /d "%~dp0"

REM Create data directory if needed
if not exist data mkdir data

echo  Server starting on http://localhost:4099
echo  Press Ctrl+C to stop
echo.

!PYTHON_CMD! backend/app.py
goto menu

REM ==========================================
REM OPTION 2: Update
REM ==========================================
:update
cls
echo.
echo  ==========================================
echo  Updating YT and Chill...
echo  ==========================================
echo.

cd /d "%~dp0"

REM Check git
git --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Git is not installed.
    echo  Please install Git from https://git-scm.com/
    echo.
    pause
    goto menu
)

REM Check if git repo
if not exist .git (
    echo  ERROR: This is not a git repository.
    echo  Please clone the repo first or run Setup.
    echo.
    pause
    goto menu
)

call :find_python
if "!PYTHON_CMD!"=="" (
    echo  ERROR: No compatible Python found. Run Setup first.
    pause
    goto menu
)

echo  Pulling latest changes...
git pull origin main
if errorlevel 1 (
    echo.
    echo  Git pull failed. Trying to stash local changes...
    git stash
    git pull origin main
    if errorlevel 1 (
        echo  ERROR: Could not pull updates.
        pause
        goto menu
    )
    echo  Note: Local changes stashed. Run 'git stash pop' to restore.
)

echo.
echo  Updating Python dependencies...
cd backend
!PYTHON_CMD! -m pip install -r requirements.txt --quiet
cd ..

echo.
echo  Updating Node dependencies...
cd frontend
call npm install --silent
if errorlevel 1 (
    echo  ERROR: npm install failed
    pause
    goto menu
)

echo.
echo  Rebuilding frontend...
call npm run build
if errorlevel 1 (
    echo  ERROR: Build failed
    pause
    goto menu
)
cd ..

echo.
echo  ==========================================
echo  Update complete!
echo  ==========================================
echo.
pause
goto menu

REM ==========================================
REM OPTION 3: Initial Setup
REM ==========================================
:setup
cls
echo.
echo  ==========================================
echo  YT and Chill - Initial Setup
echo  ==========================================
echo.

cd /d "%~dp0"

REM Find or install Python
call :find_python
if "!PYTHON_CMD!"=="" (
    echo  No compatible Python found (need 3.11-3.13)
    echo.
    echo  Installing Python 3.12 via winget...
    winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo.
        echo  ERROR: Failed to install Python.
        echo  Please install manually from https://python.org
        pause
        goto menu
    )
    echo.
    echo  Python installed! Please restart this script.
    pause
    goto menu
)

echo  Found Python: !PYTHON_CMD!
echo.

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo  Node.js not found. Installing...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo  ERROR: Failed to install Node.js
        echo  Please install manually from https://nodejs.org
        pause
        goto menu
    )
    echo  Node.js installed! Please restart this script.
    pause
    goto menu
)

REM Check ffmpeg (includes ffprobe, needed for MKV re-encoding)
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo  ffmpeg not found. Installing...
    winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo  WARNING: Could not install ffmpeg.
        echo  MKV re-encoding will not work without ffmpeg.
    ) else (
        echo  ffmpeg installed!
        echo  NOTE: You may need to restart this terminal for PATH to update.
    )
)

REM Check Deno (required for yt-dlp JavaScript extractors)
deno --version >nul 2>&1
if errorlevel 1 (
    echo  Deno not found. Installing via official installer...
    powershell -Command "irm https://deno.land/install.ps1 | iex"
    if errorlevel 1 (
        echo  WARNING: Could not install Deno.
        echo  Some yt-dlp features may not work.
        echo  You can install manually from https://deno.land
    ) else (
        echo  Deno installed!
        echo  NOTE: You may need to restart this terminal for PATH to update.
    )
)

echo.
echo  Creating directories...
if not exist data mkdir data
if not exist downloads mkdir downloads
if not exist downloads\imports mkdir downloads\imports
if not exist logs mkdir logs

echo.
echo  Installing Python dependencies...
cd backend
!PYTHON_CMD! -m pip install -r requirements.txt
if errorlevel 1 (
    echo  ERROR: Failed to install Python dependencies
    pause
    goto menu
)
cd ..

echo.
echo  Installing Node.js dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo  ERROR: Failed to install Node.js dependencies
    pause
    goto menu
)

echo.
echo  Building frontend...
call npm run build
if errorlevel 1 (
    echo  ERROR: Failed to build frontend
    pause
    goto menu
)
cd ..

echo.
echo  Creating cookies.txt...
if not exist backend\cookies.txt (
    type nul > backend\cookies.txt
)

echo.
echo  ==========================================
echo  Setup complete!
echo  ==========================================
echo.
echo  Select option 1 from the menu to start.
echo.
pause
goto menu

REM ==========================================
REM Helper: Find Python
REM ==========================================
:find_python
set PYTHON_CMD=

REM Try py launcher with specific versions
py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.12
    goto :eof
)

py -3.13 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.13
    goto :eof
)

py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.11
    goto :eof
)

REM Check default python
python --version 2>&1 | findstr /R "3\.11\. 3\.12\. 3\.13\." >nul
if not errorlevel 1 (
    set PYTHON_CMD=python
    goto :eof
)

goto :eof

REM ==========================================
REM Exit
REM ==========================================
:end
echo.
echo  Goodbye!
echo.
endlocal
exit /b 0
