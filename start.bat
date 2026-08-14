@echo off
setlocal
cd /d "%~dp0"

if not exist .env copy /Y .env.example .env >nul

echo [Yandex Games AI Factory] Building container...
docker compose build factory
if errorlevel 1 goto :error

echo [Yandex Games AI Factory] Starting interactive CLI...
docker compose run --rm --service-ports factory npm run cli
if errorlevel 1 goto :error

exit /b 0

:error
echo [Yandex Games AI Factory] Command failed. Check Docker Desktop and the log above.
exit /b 1
