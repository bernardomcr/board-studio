@echo off
title Board - teste local
cd /d "%~dp0app"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado.
  echo Instale a versao LTS em https://nodejs.org e execute este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias ^(so na primeira vez^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto erro
)

echo.
echo Compilando...
call npm run build
if errorlevel 1 goto erro

echo.
echo ============================================================
echo  Abrindo o board no navegador.
echo  Para encerrar, feche esta janela ou pressione Ctrl+C.
echo ============================================================
echo.

call npx vite preview --open
exit /b 0

:erro
echo.
echo Algo falhou. Leia as mensagens acima.
pause
exit /b 1
