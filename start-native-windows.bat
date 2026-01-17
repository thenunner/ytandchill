@echo off
echo ==========================================
echo Starting YT and Chill (Native Windows)
echo ==========================================
echo.

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
echo Please install Python 3.12 from https://www.python.org/downloads/
pause
exit /b 1

:python_found
echo Using: %PYTHON_CMD%
echo.
echo Starting backend server on port 4099...
echo.
echo Press Ctrl+C to stop the server
echo.
cd backend
%PYTHON_CMD% app.py
