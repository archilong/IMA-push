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

if not exist "%~dp0cpolar\start-ima-cpolar.ps1" (
  echo Missing cpolar startup script:
  echo %~dp0cpolar\start-ima-cpolar.ps1
  pause
  exit /b 1
)

echo Starting IMA transfer service and cpolar tunnel...
echo.
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0cpolar\start-ima-cpolar.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Startup failed. Please check the message above.
  pause
  exit /b %EXIT_CODE%
)

echo Local IMA UI: http://127.0.0.1:39387/
echo Public webhook address is shown above as PUBLIC_WEBHOOK_URL.
echo No token is required.
start "" "http://127.0.0.1:39387/"

echo.
echo Keep this window or the background processes running while receiving Officebook data.
echo Press any key to close this window.
pause >nul
exit /b 0
