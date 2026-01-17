@echo off
echo ==========================================
echo YT and Chill - Update (Windows)
echo ==========================================
echo.

REM Ensure we're in the project root directory
cd /d "%~dp0"

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed
    echo.
    echo Installing Git via winget...
    winget install Git.Git --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install Git automatically.
        echo Please install manually from https://git-scm.com/
        pause
        exit /b 1
    )
    echo.
    echo Git installed! Please close this window and run update again.
    pause
    exit /b 0
)

REM Find a compatible Python version (3.11, 3.12, or 3.13)
set PYTHON_CMD=

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

python --version 2>&1 | findstr /R "3\.11\. 3\.12\. 3\.13\." >nul
if not errorlevel 1 (
    set PYTHON_CMD=python
    goto :python_found
)

echo ERROR: No compatible Python version found (need 3.11-3.13)
echo Please run setup-native-windows.bat first
pause
exit /b 1

:python_found
echo Using: %PYTHON_CMD%
echo.

REM Check if this is a git repository
if not exist .git (
    echo ERROR: This is not a git repository.
    echo.
    echo To set up fresh, run these commands:
    echo   git clone https://github.com/thenunner/ytandchill.git
    echo   cd ytandchill
    echo   setup-native-windows.bat
    echo.
    pause
    exit /b 1
)

echo.
echo Pulling latest changes from GitHub...
echo.
git pull origin main
if errorlevel 1 (
    echo.
    echo WARNING: Git pull failed. You may have local changes.
    echo Attempting to stash and retry...
    git stash
    git pull origin main
    if errorlevel 1 (
        echo.
        echo ERROR: Could not pull updates. Please resolve manually.
        pause
        exit /b 1
    )
    echo.
    echo Note: Your local changes were stashed. Run 'git stash pop' to restore them.
)

echo.
echo Updating Python dependencies...
cd backend
%PYTHON_CMD% -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)
cd ..

echo.
echo Updating Node.js dependencies...
cd frontend
call npm install --silent
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
echo ==========================================
echo Update complete!
echo ==========================================
echo.
echo To start the application:
echo   start-native-windows.bat
echo.
pause
