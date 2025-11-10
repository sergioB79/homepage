@echo off
setlocal
cd /d "%~dp0"

set FILE=%1
if "%FILE%"=="" set FILE=categoriasNovas.txt

if not exist scripts (
  mkdir scripts
)

node scripts\build-graph.cjs "%FILE%"
if errorlevel 1 (
  echo Build FAILED
  exit /b 1
) else (
  echo Build OK
)

