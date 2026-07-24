@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

where pwsh >nul 2>nul
if errorlevel 1 (
  echo PowerShell 7 ^(pwsh^) was not found in PATH.
  echo Please install PowerShell 7 or add pwsh to PATH.
  pause
  exit /b 1
)

pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ima-cpolar.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo cpolar startup failed. Please check the message above.
)
echo Press any key to close this window.
pause >nul
exit /b %EXIT_CODE%
