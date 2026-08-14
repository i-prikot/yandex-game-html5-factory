@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
  echo Usage: build.bat GAME_SLUG
  exit /b 2
)

if not exist .env copy /Y .env.example .env >nul
docker compose run --rm factory npm run cli -- build "%~1"
if errorlevel 1 (
  echo [Yandex Games AI Factory] Build failed.
  exit /b 1
)

echo [Yandex Games AI Factory] Package is available under output\packages.
exit /b 0
